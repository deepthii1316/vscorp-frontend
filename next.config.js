/** @type {import('next').NextConfig} */
const nextConfig = {
	async headers() {
		return [
			{
				source: '/api/:path*',
				headers: [
					{ key: 'Access-Control-Allow-Origin', value: process.env.FRONTEND_ORIGIN || '*' },
					{ key: 'Access-Control-Allow-Headers', value: 'Authorization, Content-Type' },
					{ key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
				],
			},
		];
	},
};

module.exports = nextConfig;
