import requests
import time
import json
import os
from PIL import Image
from io import BytesIO

def generate_image(prompt="A golden cat"):
    base_url = 'https://api-inference.modelscope.ai/'
    
    # Make sure to set this in your environment variables
    api_key = os.environ.get("VIVEK_AI_BOL_IMG", "YOUR_API_KEY_HERE")

    common_headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    print(f"Starting generation for prompt: '{prompt}'...")

    response = requests.post(
        f"{base_url}v1/images/generations",
        headers={**common_headers, "X-ModelScope-Async-Mode": "true"},
        data=json.dumps({
            "model": "Tongyi-MAI/Z-Image-Turbo",
            "prompt": prompt
        }, ensure_ascii=False).encode('utf-8')
    )

    response.raise_for_status()
    task_id = response.json()["task_id"]
    print(f"Task ID received: {task_id}. Waiting for completion...")

    while True:
        result = requests.get(
            f"{base_url}v1/tasks/{task_id}",
            headers={**common_headers, "X-ModelScope-Task-Type": "image_generation"},
        )
        result.raise_for_status()
        data = result.json()

        if data["task_status"] == "SUCCEED":
            print("Success! Downloading image...")
            image_url = data["output_images"][0]
            image_response = requests.get(image_url)
            image = Image.open(BytesIO(image_response.content))
            image.save("result_image.jpg")
            print("Image saved as result_image.jpg")
            break
        elif data["task_status"] == "FAILED":
            print("Image Generation Failed.")
            break

        time.sleep(2) # Turbo model is fast, 2 seconds is better than 5

if __name__ == "__main__":
    generate_image("A futuristic cyberpunk city with neon lights")
