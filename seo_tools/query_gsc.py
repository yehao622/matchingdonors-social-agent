import pandas as pd
from google.oauth2 import service_account
from googleapiclient.discovery import build

def get_gsc_organic_performance(site_url: str, start_date: str, end_date: str):
    """
    Fetches organic search performance for articles on the site.
    """
    # Initialize the GSC API Client
    credentials = service_account.Credentials.from_service_account_file(
        "credentials.json", 
        scopes=['https://www.googleapis.com/auth/webmasters.readonly']
    )
    service = build('webmasters', 'v3', credentials=credentials)

    # Construct the query payload
    request = {
        'startDate': start_date,
        'endDate': end_date,
        'dimensions': ['page', 'query'],
        'rowLimit': 5000 # Adjust as needed
    }

    response = service.searchanalytics().query(siteUrl=site_url, body=request).execute()

    # Parse into a Pandas DataFrame
    data = []
    if 'rows' in response:
        for row in response['rows']:
            data.append({
                "Landing Page": row['keys'][0].replace(site_url, ''), # Normalize URL to match GA4
                "Search Query": row['keys'][1],
                "Organic Clicks": row['clicks'],
                "Organic Impressions": row['impressions'],
                "Organic CTR": row['ctr'],
                "Avg Google Position": row['position']
            })

    df = pd.DataFrame(data)
    return df

# Example Usage:
# gsc_df = get_gsc_organic_performance("https://matchingdonors.com", "2026-04-01", "2026-05-06")
# print(gsc_df.head())
