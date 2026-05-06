import pandas as pd

# Import the function we wrote earlier from your file
from inter_ga_gsc import merge_traffic_data 

print("🚀 Starting the Dry Run Data Test...\n")

# 1. Create Mock GA4 Data (Simulating our AI Agent's social traffic)
ga4_data = {
    'Landing Page': [
        '/news/kidney-allocation-review', 
        '/news/diabetes-diet', 
        '/news/atlanta-recipient-story' # This one is ONLY in GA4
    ],
    'Sessions': [1200, 850, 400],
    'Engaged Sessions': [900, 600, 150],
    'Conversions': [15, 8, 2]
}
mock_ga4_df = pd.DataFrame(ga4_data)
print("📊 Mock GA4 Data Created:")
print(mock_ga4_df.to_string(), "\n")

# 2. Create Mock GSC Data (Simulating Organic Google Search traffic)
gsc_data = {
    'Landing Page': [
        '/news/kidney-allocation-review', 
        '/news/diabetes-diet', 
        '/news/legacy-article' # This one is ONLY in GSC
    ],
    'Organic Clicks': [350, 200, 50],
    'Organic Impressions': [5000, 3200, 800],
    'Avg Google Position': [12.5, 18.2, 35.0]
}
mock_gsc_df = pd.DataFrame(gsc_data)
print("🔍 Mock GSC Data Created:")
print(mock_gsc_df.to_string(), "\n")

# 3. Test the Merge Logic!
try:
    print("⚙️ Running merge_traffic_data()...")
    final_report = merge_traffic_data(mock_ga4_df, mock_gsc_df)
    
    print("\n✅ Merge Successful! Here is the final combined report:")
    print("-" * 60)
    print(final_report.to_string())
    print("-" * 60)
    
    # Test the CSV export functionality
    test_filename = 'mock_ai_agent_seo_impact.csv'
    final_report.to_csv(test_filename, index=False)
    print(f"\n📁 Successfully saved test output to '{test_filename}'")
    
except Exception as e:
    print(f"\n❌ Error during merge: {e}")
    print("Please check that inter_ga_gsc.py contains the merge_traffic_data function.")
