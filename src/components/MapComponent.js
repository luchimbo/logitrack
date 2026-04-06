import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useMemo } from 'react';

// Fix Leaflet marker icons not showing in Next.js
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png').default,
    iconUrl: require('leaflet/dist/images/marker-icon.png').default,
    shadowUrl: require('leaflet/dist/images/marker-shadow.png').default,
});

export default function MapComponent({ view, shipments, carriers }) {
    // Configure default center and zoom per view
    const center = view === 'flex' ? [-34.6037, -58.3816] : [-38.4161, -63.6167];
    const zoom = view === 'flex' ? 10 : 5;

    // Helper memory map for custom icons based on carrier color
    const customIcons = useMemo(() => {
        const icons = {};
        carriers.forEach(c => {
            const svgIcon = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                <path fill="${c.color || '#3b82f6'}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            `;
            icons[c.name] = new L.DivIcon({
                html: svgIcon,
                className: 'custom-map-marker',
                iconSize: [24, 24],
                iconAnchor: [12, 24],
                popupAnchor: [0, -20]
            });
        });

        // Default Unassigned icon
        const svgIconUnassigned = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
            <path fill="#ef4444" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
        `;
        icons['unassigned'] = new L.DivIcon({
            html: svgIconUnassigned,
            className: 'custom-map-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -20]
        });

        return icons;
    }, [carriers]);

    return (
        <MapContainer center={center} zoom={zoom} style={{ height: "100%", width: "100%", zIndex: 0 }}>
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {shipments.map(s => {
                const icon = customIcons[s.assigned_carrier || 'unassigned'];
                const carrierData = carriers.find(c => c.name === s.assigned_carrier);

                return (
                    <Marker key={s.id} position={[s.lat, s.lng]} icon={icon}>
                        <Popup>
                            <div style={{ padding: "0" }}>
                                <h3 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "bold" }}>{s.product_name}</h3>
                                <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "#666" }}>
                                    {s.address}, {s.city || s.partido}
                                </p>
                                <span style={{
                                    display: "inline-block",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    fontWeight: "bold",
                                    backgroundColor: carrierData ? carrierData.color + '22' : '#fecaca',
                                    color: carrierData ? carrierData.color : '#b91c1c'
                                }}>
                                    {carrierData ? carrierData.display_name : 'No Asignado'}
                                </span>
                            </div>
                        </Popup>
                    </Marker>
                );
            })}
        </MapContainer>
    );
}
