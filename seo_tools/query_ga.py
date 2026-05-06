import os
import pandas as pd
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

# 1. Set credentials environment variable
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "credentials.json"

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
