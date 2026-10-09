import React, { useEffect, useRef } from 'react';
import { API_URL } from '../utilities/resortHooks';
import { formatLocation, hasCoordinates } from '../utilities/resorts';

// ---------------------------------------------------------------------------
// Interactive Leaflet map of resorts.
//
// Leaflet itself is loaded from public/leaflet via a <script> tag in
// public/index.html and used through window.L. Map tiles come from HERE
// through the backend (/ski/tiles), which keeps the HERE API key server side.
//
// Props:
//   resorts         resorts to plot (entries without coordinates are skipped)
//   nearbyBySlug    optional Map of slug -> { distance, duration } driving info
//   origin          optional { latitude, longitude, label } search location
//   activeSlug      optional resort to emphasize (used on a resort's own page)
//   maxZoom         how far the map may zoom in when fitting the markers
//   onSelectResort  called with a slug when "View resort" is clicked in a popup
// ---------------------------------------------------------------------------
const DEFAULT_CENTER = [42.5, -73.5]; // the Northeast
const DEFAULT_ZOOM = 5;

const ResortMap = ({ resorts, nearbyBySlug = new Map(), origin = null, activeSlug = '', maxZoom = 7, onSelectResort }) => {
    const mapElement = useRef(null);
    const mapInstance = useRef(null);

    // Serialize only what the markers need, so the marker effect below re-runs
    // when the data actually changes rather than on every parent render.
    const mapDataKey = JSON.stringify({
        resorts: resorts.filter(hasCoordinates).map((resort) => ({
            slug: resort.slug,
            name: resort.name,
            location: formatLocation(resort),
            latitude: resort.latitude,
            longitude: resort.longitude,
            route: nearbyBySlug.get(resort.slug)
        })),
        origin,
        activeSlug,
        maxZoom
    });

    // Create the map once.
    useEffect(() => {
        if (!mapElement.current || !window.L) return undefined;

        const map = window.L.map(mapElement.current, { scrollWheelZoom: false });
        window.L.tileLayer(`${API_URL}/ski/tiles/{z}/{x}/{y}.png`, {
            tileSize: 512,
            zoomOffset: -1,
            maxZoom: 19,
            attribution: '&copy; HERE'
        }).addTo(map);
        map.attributionControl.setPrefix(false);
        mapInstance.current = map;
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

        return () => {
            map.remove();
            mapInstance.current = null;
        };
    }, []);

    // Redraw markers whenever the resort list, origin, or active resort changes.
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !window.L) return undefined;

        const mapData = JSON.parse(mapDataKey);
        const markers = window.L.featureGroup().addTo(map);
        let activeMarker = null;

        mapData.resorts.forEach((resort) => {
            const isActive = resort.slug === mapData.activeSlug;
            // On a resort page, neighbours are small dots so the main resort stands out.
            const marker = mapData.activeSlug && !isActive
                ? window.L.circleMarker([resort.latitude, resort.longitude], {
                    radius: 6, color: '#fff', weight: 2, fillColor: '#203e32', fillOpacity: 0.9
                })
                : window.L.marker([resort.latitude, resort.longitude]);
            marker.addTo(markers);
            if (isActive) activeMarker = marker;

            // Popups are built with DOM nodes (not HTML strings) so resort names
            // from the API can never inject markup.
            const popup = document.createElement('div');
            popup.className = 'resort-popup';
            const title = document.createElement('strong');
            title.textContent = resort.name;
            popup.appendChild(title);

            const place = document.createElement('div');
            place.textContent = resort.location;
            popup.appendChild(place);

            if (resort.route) {
                const drive = document.createElement('div');
                drive.textContent = `${resort.route.distance.text} · ${resort.route.duration.text}`;
                popup.appendChild(drive);
            }

            if (onSelectResort && !isActive) {
                const link = document.createElement('button');
                link.type = 'button';
                link.className = 'resort-popup-link';
                link.textContent = 'View resort →';
                link.addEventListener('click', () => onSelectResort(resort.slug));
                popup.appendChild(link);
            }

            marker.bindPopup(popup);
        });

        if (mapData.origin && Number.isFinite(mapData.origin.latitude) && Number.isFinite(mapData.origin.longitude)) {
            const originMarker = window.L.circleMarker([mapData.origin.latitude, mapData.origin.longitude], {
                radius: 8,
                color: '#fff',
                weight: 3,
                fillColor: '#c66b45',
                fillOpacity: 1
            }).addTo(markers);
            originMarker.bindPopup(mapData.origin.label);
        }

        if (markers.getLayers().length) {
            map.fitBounds(markers.getBounds().pad(0.12), { maxZoom: mapData.maxZoom });
        } else {
            map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        }
        if (activeMarker) activeMarker.openPopup();

        return () => map.removeLayer(markers);
    }, [mapDataKey, onSelectResort]);

    return <div className="resorts-map" ref={mapElement} role="application" aria-label="Interactive map of ski resorts" />;
};

export default ResortMap;
