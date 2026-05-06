# Assuming have both 'ga4_df' and 'gsc_df'
import pandas as pd

def merge_traffic_data(ga4_df, gsc_df):
    if ga4_df.empty or gsc_df.empty:
        return "Not enough data to merge yet."

    # Group GSC data by page to get average position and total clicks per article
    gsc_grouped = gsc_df.groupby('Landing Page').agg({
        'Organic Clicks': 'sum',
        'Organic Impressions': 'sum',
        'Avg Google Position': 'mean'
    }).reset_index()

    # Group GA4 data by page
    ga4_grouped = ga4_df.groupby('Landing Page').agg({
        'Sessions': 'sum',
        'Engaged Sessions': 'sum',
        'Conversions': 'sum'
    }).reset_index()

    # Merge the two datasets!
    merged_df = pd.merge(ga4_grouped, gsc_grouped, on='Landing Page', how='outer').fillna(0)
    
    # Sort by the articles driving the most social sessions
    merged_df = merged_df.sort_values(by='Sessions', ascending=False)
    
    return merged_df

# final_report = merge_traffic_data(ga4_df, gsc_df)
# final_report.to_csv('ai_agent_seo_impact.csv', index=False)
