# Isolated UI review

Run `npm run review` from the frontend directory. This test-only Vite configuration uses the real UI with a clearly labeled review identity and empty API responses. Mutations are rejected. No business records are represented by this harness.

It is separate from the production entry point and must never be deployed. Use it for layout review only. Authenticated workflow, permissions and database tests require the normal application and a controlled test database.
