
import os
import sys
from unittest.mock import MagicMock

# Create a mock objects that can act as packages
def create_mock_package(name):
    m = MagicMock()
    m.__path__ = []
    sys.modules[name] = m
    return m

create_mock_package('facebook_business')
create_mock_package('facebook_business.api')
create_mock_package('facebook_business.adobjects')
sys.modules['facebook_business.adobjects.adaccount'] = MagicMock()
sys.modules['facebook_business.adobjects.user'] = MagicMock()
sys.modules['facebook_business.adobjects.campaign'] = MagicMock()
sys.modules['facebook_business.adobjects.adset'] = MagicMock()
sys.modules['facebook_business.adobjects.ad'] = MagicMock()

# Add src to path
sys.path.append(os.path.abspath('.'))

from src.services.supabase_service import get_supabase_admin_client

def test_query():
    try:
        supabase = get_supabase_admin_client()
        print("Connected to Supabase")
        
        # Get one item from media_library to check schema
        res = supabase.table('media_library').select('*').limit(1).execute()
        
        if res.data:
            print("Successfully queried media_library")
            print("Keys:", res.data[0].keys())
            print("First item:", res.data[0])
        else:
            print("media_library is empty")
            
        # Try to find a user
        res_user = supabase.table('users').select('id, workspace_id').limit(1).execute()
        if res_user.data:
            print("Found a user:", res_user.data[0])
        else:
            print("No users found")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_query()
