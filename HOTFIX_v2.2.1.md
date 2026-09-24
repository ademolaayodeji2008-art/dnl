# v2.2.1 Frontend Cache Hotfix

The v2.2 UI already contains the View Details button, but the server was caching `/public/app.js` for one hour.

## Replace
- `server.js`

Then:
1. Stop the running server with `Ctrl + C`.
2. Save/replace `server.js`.
3. Run `npm start`.
4. In the browser press `Ctrl + F5` once.

After this hotfix, frontend files are served with no-cache headers during this local development phase, so UI changes appear immediately after restart.
