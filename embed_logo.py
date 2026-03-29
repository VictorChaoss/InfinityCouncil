import base64
import os

# Path to the artifact image
img_path = os.path.expanduser('~/.gemini/antigravity/brain/e022be71-a072-49b1-b5c1-62170bd1451a/council_logo_gauntlet_four_stones_1774818206104.png')

try:
    # Read and encode
    with open(img_path, 'rb') as f:
        b64_str = base64.b64encode(f.read()).decode('utf-8')

    b64_data_uri = f"data:image/png;base64,{b64_str}"

    # Inject into index.html
    if os.path.exists('index.html'):
        with open('index.html', 'r', encoding='utf-8') as f:
            index_html = f.read()
        index_html = index_html.replace('src="gauntlet_logo.png"', f'src="{b64_data_uri}"')
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(index_html)
        print("Updated index.html")

    # Inject into app.html
    if os.path.exists('app.html'):
        with open('app.html', 'r', encoding='utf-8') as f:
            app_html = f.read()
        app_html = app_html.replace('src="gauntlet_logo.png"', f'src="{b64_data_uri}"')
        with open('app.html', 'w', encoding='utf-8') as f:
            f.write(app_html)
        print("Updated app.html")

    print("Successfully injected Base64 Data URIs!")
except Exception as e:
    print(f"Error: {e}")
