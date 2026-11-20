# Import necessary libraries
import os
import requests
import json

# Define the API key (replace with your actual API key)
API_KEY = "your-api-key-here"

# Define the base URL for the API
BASE_URL = "https://api.example.com/v1"


def fetch_user_data(user_id):
    """
    This function is used to fetch user data from the API.

    Args:
        user_id (int): The ID of the user to fetch.

    Returns:
        dict: A dictionary containing the user data.
    """
    # Step 1: Construct the URL
    url = f"{BASE_URL}/users/{user_id}"

    # Step 2: Set up the headers
    headers = {"Authorization": f"Bearer {API_KEY}"}

    try:
        # Step 3: Send the GET request
        response = requests.get(url, headers=headers)

        # Check if the request was successful
        if response.status_code == 200:
            # Parse the JSON response
            data = response.json()
            print("✅ Successfully fetched user data!")
            # Return the data
            return data
        else:
            print(f"❌ Failed to fetch data. Status code: {response.status_code}")
            return None
    except Exception as e:
        # Handle any errors that occur
        print(f"An error occurred: {e}")
        return None


def save_to_file(data, filename):
    """
    This function saves the data to a JSON file.
    """
    # Open the file in write mode
    with open(filename, "w") as f:
        # Write the data to the file
        json.dump(data, f, indent=4)
    # Print a success message
    print(f"🎉 Data saved to {filename}")


# Example usage
if __name__ == "__main__":
    # Fetch the user data
    user = fetch_user_data(1)

    # Check if the data was fetched successfully
    if user:
        # Save the data to a file
        save_to_file(user, "user.json")

    # Note: In a real application, you would want to add proper error handling and logging.
