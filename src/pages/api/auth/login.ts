import type { APIRoute } from 'astro'

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
    const body = await request.json().catch(() => null);

    if (!body) {
        return new Response(JSON.stringify({ success: false, error: 'Missing JSON body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const { email, password } = body;

    if (email === 'admin@example.com' && password === '123456') {
        return new Response(
            JSON.stringify({
                success: true,
                token: 'fake-jwt-token',
                user: { email, name: 'Admin' }
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }

    return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
    });
};
