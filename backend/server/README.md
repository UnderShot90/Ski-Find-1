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

Nearby resort search uses HERE Geocoding and Matrix Routing. Create a HERE API key with access to Geocoding and Search and Matrix Routing, then set `HERE_API_KEY=<your-here-api-key>` in `backend/server/.env`. Keep the key server-side.

- `POST http://localhost:8081/ski/nearby` accepts an `origin` (`{ "address": "Denver, CO" }` or `{ "latitude": 39.7, "longitude": -105.0 }`) and a list of resorts with `slug`, `name`, `latitude`, and `longitude`.
- The server compares the closest 25 resorts using driving distance. Resorts from the upstream feed without coordinates are not eligible for nearby results.

Saved resorts require `Authorization: Bearer <accessToken>`:

- `GET http://localhost:8081/resorts` lists the signed-in user's resorts.
- `POST http://localhost:8081/resorts` saves `{ "slug": "whistler-blackcomb", "name": "Whistler Blackcomb", "country": "Canada", "region": "British Columbia" }`.
- `DELETE http://localhost:8081/resorts/:slug` removes a saved resort.
