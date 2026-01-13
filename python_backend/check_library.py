
import os
import sys
from unittest.mock import MagicMock

# Mock facebook_business
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

def check_all():
    try:
        supabase = get_supabase_admin_client()
        res = supabase.table('media_library').select('id, prompt, created_at, type').eq('workspace_id', '72f4e5fd-00dc-415a-ac82-c58cba21d05b').execute()
        
        print(f"Total entries: {len(res.data)}")
        for item in res.data:
            print(f"ID: {item['id']} | Type: {item['type']} | Prompt: {item['prompt']} | Created: {item['created_at']}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_all()
