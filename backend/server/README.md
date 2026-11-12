### If this is your first time running this service
copy & paste ( in terminal ) : 
- git clone https://github.com/Tochey/User_Service.git
- cd server
- npm install 
- npm run server
#### In another terminal tab
- cd client
- npm install
- npm start

### Disclaimer : pushing your .env file IS NOT safe. It is done here to simplify the start up process
### To use the 'test.rest' file, install Rest Client (vsCode Extension) or just use boring postman🫥

### Ski resort API
Set `RAPIDAPI_KEY` in `backend/server/.env` to your RapidAPI key. Do not commit this key. The backend proxies these endpoints:

- `GET http://localhost:8081/ski/`
- `GET http://localhost:8081/ski/v1/resort`
- `GET http://localhost:8081/ski/v1/resort/:slug` (for example, `whistler-blackcomb`)

Nearby resort search uses HERE Geocoding and Matrix Routing. The resorts page also uses HERE Raster Tile API for its interactive map. Create a HERE API key with access to Geocoding and Search, Matrix Routing, and Raster Tile API, then set `HERE_API_KEY=<your-here-api-key>` in `backend/server/.env`. Keep the key server-side.

- `POST http://localhost:8081/ski/nearby` accepts an `origin` (`{ "address": "Denver, CO" }` or `{ "latitude": 39.7, "longitude": -105.0 }`) and a list of resorts with `slug`, `name`, `latitude`, and `longitude`.
- The server compares the closest 25 resorts using driving distance. Resorts from the upstream feed without coordinates are not eligible for nearby results.

### AI trail breakdowns (Anthropic)
Resort pages rate each mountain's difficulty from its vertical drop and, when known, its mix of green, blue, and black trails. If a resort's trail mix isn't in the catalog, a signed-in user can click **Look up trail breakdown with AI**: the backend asks Claude to search the web for the resort's published trail stats, then stores the answer in MongoDB (`resortterrains` collection) so each resort is looked up only once.

1. Create an API key at https://console.anthropic.com (Settings → API Keys) and add billing credit.
2. Add it to `backend/server/.env` (this file is gitignored; never commit the key or put it in the frontend):
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   # Optional: max new lookups per day across all users (default 50)
   AI_DAILY_LOOKUP_LIMIT=50
   ```
3. Restart the backend.

Without the key the site still works; resorts are rated from vertical drop and the lookup button explains that AI is not set up.

- `GET http://localhost:8081/terrain` lists every stored breakdown.
- `GET http://localhost:8081/terrain/:slug` returns one resort's breakdown.
- `POST http://localhost:8081/terrain/:slug` (requires `Authorization: Bearer <accessToken>`) looks one up with `{ "name": "Killington", "region": "VT", "website": "https://www.killington.com" }`.

### AI live conditions (Anthropic)
The **Live conditions** panel on each resort page is researched by Claude with web search: open/closed status, weather and temperature, new snow, base depth, lifts and trails open, the adult day ticket price, and webcam links. Reports are stored in MongoDB (`resortconditions` collection) and reused until they are older than `CONDITIONS_CACHE_HOURS`. Anything Claude can't find is left blank instead of guessed. The directory can sort by every field except webcams.

- When a signed-in user opens a resort page with a missing or old report, it refreshes automatically. A lookup takes about a minute.
- Admins can refresh every catalog resort at once from **Reports → Refresh conditions**, so the directory has data to sort on. Fresh reports are skipped.
- Each lookup is a paid API call. Optional settings in `backend/server/.env`:
  ```
  CONDITIONS_CACHE_HOURS=6          # how long a report is reused (default 6)
  AI_DAILY_CONDITIONS_LIMIT=150     # max new lookups per day across all users (default 150)
  ```

- `GET http://localhost:8081/conditions` lists every stored report.
- `GET http://localhost:8081/conditions/:slug` returns one resort's report.
- `POST http://localhost:8081/conditions/:slug` (requires `Authorization: Bearer <accessToken>`) refreshes one with `{ "name": "Killington", "region": "VT", "website": "https://www.killington.com" }`.
- `POST http://localhost:8081/conditions/refresh` (admins) refreshes `{ "resorts": [{ "slug", "name", "region", "website" }] }` in the background; `GET` on the same path shows progress.

Saved resorts require `Authorization: Bearer <accessToken>`:

- `GET http://localhost:8081/resorts` lists the signed-in user's resorts.
- `POST http://localhost:8081/resorts` saves `{ "slug": "whistler-blackcomb", "name": "Whistler Blackcomb", "country": "Canada", "region": "British Columbia" }`.
- `DELETE http://localhost:8081/resorts/:slug` removes a saved resort.
