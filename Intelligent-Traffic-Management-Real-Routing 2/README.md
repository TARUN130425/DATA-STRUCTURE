# SmartTraffic - Real Routing Version

## Run
1. Extract the ZIP.
2. Open the folder in VS Code.
3. Install the Live Server extension.
4. Open `index.html`.
5. Right-click -> Open with Live Server.

## Dynamic Route
The Dynamic Route page now:
- Geocodes the user's typed locations using OpenStreetMap Nominatim.
- Calculates driving/bike routes on the real OpenStreetMap road network using OSRM.
- Requests alternative routes where available.
- Displays the actual route geometry on an interactive Leaflet map.
- Compares distance and travel time.
- Applies an academic congestion estimate for route scoring.

The project includes explicit location handling for Chennai Central and Saveetha Engineering College (Thandalam), preventing ambiguous Saveetha search results from sending the route to an unrelated place.\n\nImportant: the congestion number in this prototype is NOT live traffic. Real-time traffic would require a traffic data provider/API.

The public Nominatim service has strict usage limits and requires appropriate attribution. This project intentionally performs geocoding only after the user clicks the route button and does not implement autocomplete.
