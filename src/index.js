export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const pathname = url.pathname;

		// No authentication required - remove this block if you want to protect the endpoint
		// const authHeader = request.headers.get('Authorization');
		// if (!authHeader || !isAuthorized(authHeader, env)) {
		// 	return new Response('Unauthorized', { 
		// 		status: 401,
		// 		headers: { 'WWW-Authenticate': 'Basic' }
		// 	});
		// }

		// CORS headers
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		};

		// Handle preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		try {
			// Route handlers
			if (pathname === '/api/sync' && request.method === 'POST') {
				return await handleBulkUpload(request, env, corsHeaders);
			} else if (pathname === '/api/list' && request.method === 'GET') {
				return await handleListFiles(request, env, corsHeaders);
			} else if (pathname === '/api/delete-all' && request.method === 'DELETE') {
				return await handleDeleteAll(request, env, corsHeaders);
			} else if (pathname.startsWith('/files/')) {
				const key = decodeURIComponent(pathname.slice(7)); // Remove '/files/' prefix and decode
				return await handleFileOperations(request, env, key, corsHeaders);
			} else {
				return new Response('Not Found', { status: 404, headers: corsHeaders });
			}
		} catch (error) {
			return new Response(JSON.stringify({ error: error.message }), {
				status: 500,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}
	},

	// Handle cron triggers for automatic sync
	async scheduled(event, env, ctx) {
		console.log('Cron trigger fired:', event.cron);
		
		try {
			// Option 1: Trigger your local sync via webhook
			if (env.SYNC_WEBHOOK_URL) {
				const response = await fetch(env.SYNC_WEBHOOK_URL, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${env.SYNC_TOKEN}`
					},
					body: JSON.stringify({
						trigger: 'cron',
						cron: event.cron,
						timestamp: new Date().toISOString()
					})
				});
				
				if (response.ok) {
					console.log('Sync webhook triggered successfully');
				} else {
					console.error('Sync webhook failed:', response.status, await response.text());
				}
			} else {
				console.log('No SYNC_WEBHOOK_URL configured, skipping webhook trigger');
			}
			
			// Option 2: Add basic cleanup tasks that can run server-side
			// For example, clean up old temporary files, logs, etc.
			
		} catch (error) {
			console.error('Scheduled sync error:', error);
		}
		
		console.log('Scheduled sync completed at:', new Date().toISOString());
	},
};

function isAuthorized(authHeader, env) {
	const token = env.SYNC_TOKEN;
	if (!token) {
		console.error('SYNC_TOKEN not found in environment');
		return false;
	}
	
	const [scheme, credentials] = authHeader.split(' ');
	
	if (scheme === 'Bearer') {
		return credentials === token;
	} else if (scheme === 'Basic') {
		const decoded = atob(credentials);
		const [username, password] = decoded.split(':');
		return password === token;
	}
	
	return false;
}

async function handleBulkUpload(request, env, corsHeaders) {
	const files = await request.json();
	const results = [];
	
	for (const file of files) {
		try {
			const content = base64ToArrayBuffer(file.content);
			await env.DELODOCS_BUCKET.put(file.path, content, {
				httpMetadata: {
					contentType: file.type || 'text/markdown',
				},
				customMetadata: {
					modified: file.modified || new Date().toISOString(),
					md5: file.md5 || ''
				}
			});
			results.push({ path: file.path, status: 'success' });
		} catch (error) {
			results.push({ path: file.path, status: 'error', error: error.message });
		}
	}
	
	return new Response(JSON.stringify({ results }), {
		headers: { ...corsHeaders, 'Content-Type': 'application/json' }
	});
}

async function handleListFiles(request, env, corsHeaders) {
	const url = new URL(request.url);
	const prefix = url.searchParams.get('prefix') || '';
	const cursor = url.searchParams.get('cursor');
	
	const options = {
		prefix,
		limit: 1000,
	};
	
	if (cursor) {
		options.cursor = cursor;
	}
	
	const listed = await env.DELODOCS_BUCKET.list(options);
	
	const files = listed.objects.map(obj => ({
		key: obj.key,
		size: obj.size,
		uploaded: obj.uploaded,
		httpEtag: obj.httpEtag,
		customMetadata: obj.customMetadata,
		md5: obj.customMetadata?.md5 || null
	}));
	
	return new Response(JSON.stringify({
		files,
		truncated: listed.truncated,
		cursor: listed.cursor,
	}), {
		headers: { ...corsHeaders, 'Content-Type': 'application/json' }
	});
}

async function handleDeleteAll(request, env, corsHeaders) {
	const objects = await env.DELODOCS_BUCKET.list({ limit: 1000 });
	const deletePromises = objects.objects.map(obj => env.DELODOCS_BUCKET.delete(obj.key));
	await Promise.all(deletePromises);
	
	return new Response(JSON.stringify({ 
		message: `Deleted ${objects.objects.length} files` 
	}), {
		headers: { ...corsHeaders, 'Content-Type': 'application/json' }
	});
}

async function handleFileOperations(request, env, key, corsHeaders) {
	switch (request.method) {
		case 'PUT':
			await env.DELODOCS_BUCKET.put(key, request.body, {
				httpMetadata: request.headers,
			});
			return new Response(JSON.stringify({ message: `Uploaded ${key}` }), {
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
			
		case 'GET':
			const object = await env.DELODOCS_BUCKET.get(key);
			if (object === null) {
				return new Response('Not Found', { status: 404, headers: corsHeaders });
			}
			
			const headers = new Headers(corsHeaders);
			object.writeHttpMetadata(headers);
			headers.set('etag', object.httpEtag);
			
			return new Response(object.body, { headers });
			
		case 'DELETE':
			await env.DELODOCS_BUCKET.delete(key);
			return new Response(JSON.stringify({ message: `Deleted ${key}` }), {
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
			
		default:
			return new Response('Method Not Allowed', {
				status: 405,
				headers: { ...corsHeaders, 'Allow': 'GET, PUT, DELETE' }
			});
	}
}

function base64ToArrayBuffer(base64) {
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
}
