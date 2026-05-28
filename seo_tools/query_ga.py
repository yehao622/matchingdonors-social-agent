import csv
import json
import os

def parse_ga4_export(csv_file_path, output_json_path):
    """
    Parses a standard GA4 UI CSV export and formats it for the AI Cron Engine.
    Handles exact casing variations like 'Link Text' from custom dimensions.
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
            # Skip empty lines or metadata rows until we hit the actual data header
            if not headers and row and any("Event name" in cell for cell in row):
                # Clean up headers (remove extra whitespace)
                headers = [cell.strip() for cell in row]
                continue
            
            # Process data rows once headers are established
            if headers and len(row) == len(headers):
                row_dict = dict(zip(headers, row))
                
                event_name = row_dict.get("Event name", "").strip()
                
                # Filter specifically for our tracked interaction event
                if event_name == "core_button_link_click":
                    # Check exact variations of the column header observed in GA4
                    button_name = (
                        row_dict.get("Link Text") or 
                        row_dict.get("Link text") or 
                        row_dict.get("Click text") or 
                        row_dict.get("Custom Event: Click Text") or 
                        "(not set)"
                    ).strip()
                    
                    # Strip numerical formatting punctuation (e.g., "1,050" -> 1050)
                    try:
                        event_count = int(row_dict.get("Event count", "0").replace(",", ""))
                    except ValueError:
                        event_count = 0

                    extracted_data.append({
                        "Event name": event_name,
                        "Button Name": button_name,
                        "Event count": event_count
                    })

    # Output the structured data directly to the file consumed by CronService.ts
    with open(output_json_path, 'w', encoding='utf-8') as json_file:
        json.dump(extracted_data, json_file, indent=4)
        
    print(f"✅ Successfully exported {len(extracted_data)} target events to {output_json_path}")

if __name__ == "__main__":
    # Path inside the seo_tools folder matching your local working tree
    INPUT_CSV = os.path.join(os.path.dirname(__file__), 'ga4_data.csv')
    
    # Absolute resolution to output analytics_output.json to the root project folder
    OUTPUT_JSON = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'analytics_output.json'))
    
    parse_ga4_export(INPUT_CSV, OUTPUT_JSON)