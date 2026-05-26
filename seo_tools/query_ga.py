import csv
import json
import os

def parse_ga4_export(csv_file_path, output_json_path):
    """
    Parses a standard GA4 UI CSV export and formats it for the AI Cron Engine.
    """
    print(f"🔍 Reading GA4 export from: {csv_file_path}")
    
    if not os.path.exists(csv_file_path):
        print(f"❌ Error: Could not find {csv_file_path}")
        return

    extracted_data = []

    with open(csv_file_path, mode='r', encoding='utf-8-sig') as file:
        reader = csv.reader(file)
        headers = []
        
        for row in reader:
            # GA4 CSVs often have metadata at the top. We skip until we find the real header row.
            if not headers and row and "Event name" in row[0]:
                headers = row
                continue
            
            # Once headers are found, start processing data rows
            if headers and len(row) == len(headers):
                row_dict = dict(zip(headers, row))
                
                event_name = row_dict.get("Event name", "")
                
                # Only process our custom button click events
                if event_name == "core_button_link_click":
                    # GA4 might export the text dimension as "Link text", "Click text", or "Custom Event: Click Text"
                    # We check a few common GA4 export column names to be safe
                    button_name = (
                        row_dict.get("Link text") or 
                        row_dict.get("Click text") or 
                        row_dict.get("Custom Event: Click Text") or 
                        "(not set)"
                    )
                    
                    # Clean up the commas in the numbers (e.g., "1,200" -> 1200)
                    try:
                        event_count = int(row_dict.get("Event count", "0").replace(",", ""))
                    except ValueError:
                        event_count = 0

                    extracted_data.append({
                        "Event name": event_name,
                        "Button Name": button_name,
                        "Event count": event_count
                    })

    # Write the sanitized data to the JSON file for the Node.js agent
    with open(output_json_path, 'w', encoding='utf-8') as json_file:
        json.dump(extracted_data, json_file, indent=4)
        
    print(f"✅ Successfully exported {len(extracted_data)} target events to {output_json_path}")

if __name__ == "__main__":
    # Define your paths here
    # Assuming you drop your GA4 export into the seo_tools folder as 'ga4_data.csv'
    INPUT_CSV = os.path.join(os.path.dirname(__file__), 'ga4_data.csv')
    
    # We point the output directly to the root folder where CronService.ts expects it
    OUTPUT_JSON = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'analytics_output.json'))
    
    parse_ga4_export(INPUT_CSV, OUTPUT_JSON)