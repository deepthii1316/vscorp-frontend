/** @type {import('next').NextConfig} */
const nextConfig = {
	// Renamed 02-Oct-2026: keep old bookmarks working.
	async redirects() {
		return [{ source: '/merchandiser-dashboard', destination: '/merch-dashboard', permanent: true }];
	},
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
