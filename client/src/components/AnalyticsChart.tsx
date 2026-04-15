import React from "react";
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

const analyticsData = [
    { name: 'Apr 09', inbound: 120, outbound: 45 },
    { name: 'Apr 10', inbound: 150, outbound: 60 },
    { name: 'Apr 11', inbound: 180, outbound: 90 },
    { name: 'Apr 12', inbound: 170, outbound: 85 },
    { name: 'Apr 13', inbound: 210, outbound: 110 },
    { name: 'Apr 14', inbound: 250, outbound: 140 },
    { name: 'Apr 15', inbound: 290, outbound: 165 },
];

export const AnalyticsChart = () => {
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
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', 'traffic_analytics_report.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

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
            <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                    <LineChart
                        data={analyticsData}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" stroke="#8884d8" />
                        <YAxis stroke="#8884d8" />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                        />
                        <Legend />
                        {/* The Blue line for Bluesky inbound clicks */}
                        <Line
                            type="monotone"
                            dataKey="inbound"
                            name="Inbound Clicks (Bluesky)"
                            stroke="#0088FE"
                            strokeWidth={3}
                            activeDot={{ r: 8 }}
                        />
                        {/* The Green line for Widget outbound clicks */}
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
        </div >
    );
};

export default AnalyticsChart;