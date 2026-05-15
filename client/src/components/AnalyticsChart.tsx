import React, { useState, useEffect } from 'react';
import { api } from '../apiClient';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';

export const AnalyticsChart = () => {
    // 1. Set up React State to hold the data from the backend
    const [chartData, setChartData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // 2. Fetch the data from the Node API when the component mounts
    useEffect(() => {
        api.getAnalytics()
            .then(data => {
                setChartData(data);
                setIsLoading(false);
            })
            .catch(error => {
                console.error("Error fetching analytics:", error);
                setIsLoading(false);
            });
    }, []);

    const handleDownloadCSV = () => {
        const headers = ['IP Address', 'Location', 'Timestamp', 'Traffic Direction', 'URL'];

        const mockData = [
            ['192.168.1.45', 'Worcester MA', '2026-04-15 09:15:22', 'Inbound', 'https://bsky.app/profile/matchingdonors'],
            ['10.0.2.115', 'Boston MA', '2026-04-15 09:30:10', 'Outbound', 'https://pubmed.ncbi.nlm.nih.gov/12345/'],
            ['172.16.0.4', 'New York NY', '2026-04-15 10:05:44', 'Inbound', 'https://bsky.app/profile/matchingdonors'],
            ['192.168.1.88', 'Providence RI', '2026-04-15 10:45:01', 'Outbound', 'https://optn.transplant.hrsa.gov/news/']
        ];

        const csvContent = [
            headers.join(','),
            ...mockData.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        // Use direct node properties
        link.href = url;
        link.download = 'traffic_analytics_report.csv';
        link.style.display = 'none'; // Safer than visibility: hidden

        document.body.appendChild(link);
        link.click();

        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // 3. Show a loading state while the data is being fetched
    if (isLoading) {
        return <div style={{ padding: '20px', textAlign: 'center' }}>Loading Analytics Pipeline...</div>;
    }

    return (
        <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '20px' }}>

            {/* 2. Added a flexbox header to align the Title and the Button side-by-side */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: '#333' }}>
                    📈 Widget Traffic Analytics (7-Day Overview)
                </h3>

                {/* The Button goes HERE */}
                <button
                    onClick={handleDownloadCSV}
                    style={{ padding: '8px 16px', backgroundColor: '#0088FE', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    📥 Download CSV
                </button>
            </div>

            {/* ResponsiveContainer makes the chart scale perfectly to fit your dashboard */}
            <div style={{ width: '100%', height: 400 }}>
                {/* Header and Download Button HTML remains the same */}
                <div style={{ width: '100%', height: '100%' }}>
                    <ResponsiveContainer>
                        <LineChart
                            data={chartData}
                            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="name" stroke="#8884d8" />
                            <YAxis stroke="#8884d8" />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                            />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="inbound"
                                name="Inbound Clicks (Bluesky)"
                                stroke="#0088FE"
                                strokeWidth={3}
                                activeDot={{ r: 8 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="outbound"
                                name="Outbound Clicks (Website)"
                                stroke="#00C49F"
                                strokeWidth={3}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div >
    );
};

export default AnalyticsChart;