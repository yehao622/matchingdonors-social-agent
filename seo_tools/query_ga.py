import os
import pandas as pd
from dotenv import load_dotenv
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange,
    Dimension,
    Metric,
    RunReportRequest,
    FilterExpression,
    FilterExpressionList,
    Filter,
)

load_dotenv()

# 1. Set credentials environment variable
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.getenv("GOOGLE_CREDENTIALS_PATH")
property_id = os.getenv("GA4_PROPERTY_ID")

def get_ga4_social_traffic(property_id: str, start_date: str = "30daysAgo", end_date: str = "today"):
    """
    Fetches traffic data specifically from UTM-tagged social agent campaigns.
    """
    client = BetaAnalyticsDataClient()

    # Filter specifically for traffic coming from our AI agent's UTM campaign
    request = RunReportRequest(
        property=f"properties/{property_id}",
        dimensions=[
            Dimension(name="landingPagePlusQueryString"), # The specific article URL
            Dimension(name="sessionSourceMedium"),        # e.g., bluesky / social
            Dimension(name="sessionCampaignName")         # e.g., ai_social_agent_v1
        ],
        metrics=[
            Metric(name="sessions"),
            Metric(name="engagedSessions"),
            Metric(name="conversions")
        ],
        date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
        # Optional: Filter only for your specific UTM campaign to isolate agent traffic
        # dimension_filter=FilterExpression(
        #     filter=Filter(
        #         field_name="sessionCampaignName",
        #         string_filter=Filter.StringFilter(value="ai_social_agent_v1")
        #     )
        # )
    )

    response = client.run_report(request)

    # Parse the response into a Pandas DataFrame for easy analysis
    data = []
    for row in response.rows:
        data.append({
            "Landing Page": row.dimension_values[0].value,
            "Source/Medium": row.dimension_values[1].value,
            "Campaign": row.dimension_values[2].value,
            "Sessions": int(row.metric_values[0].value),
            "Engaged Sessions": int(row.metric_values[1].value),
            "Conversions": int(row.metric_values[2].value),
        })

    df = pd.DataFrame(data)
    
    # Calculate Engagement Rate
    if not df.empty:
        df['Engagement Rate'] = df['Engaged Sessions'] / df['Sessions']
        
    return df

# Example Usage:
# ga4_df = get_ga4_social_traffic("YOUR_GA4_PROPERTY_ID")
# print(ga4_df.head())

def load_manual_ga4_csv(filepath):
    # The 'comment' parameter tells Pandas to ignore any line starting with '#'
    # This automatically skips Google's 9 lines of metadata at the top!
    df = pd.read_csv(filepath, comment='#')
    
    # Optional: Rename the columns so they match what our earlier Python script expects
    df = df.rename(columns={
        'Session campaign': 'Campaign',
        'Session source / medium': 'Source/Medium',
        'Sessions': 'Sessions',
        'Engaged sessions': 'Engaged Sessions'
    })
    
    return df

# Test it out!
manual_df = load_manual_ga4_csv('Traffic_acquisition_Session_campaign.csv')

print("✅ Successfully loaded manual GA4 data!")
print(manual_df[['Campaign', 'Source/Medium', 'Sessions', 'Engaged Sessions']].head())