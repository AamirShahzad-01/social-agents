-- Migration: 005_business_settings
-- Description: Create business_settings table for workspace branding and configuration
-- Date: 2025-12-20

-- ============================================
-- CREATE BUSINESS SETTINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS business_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    
    -- Business Information
    business_name TEXT NOT NULL,
    industry TEXT NOT NULL,
    description TEXT,
    website TEXT,
    contact_email TEXT,
    phone VARCHAR(20),
    address TEXT,
    
    -- Branding
    logo_url TEXT,
    social_links JSONB DEFAULT '{}',
    brand_colors TEXT[] DEFAULT '{}',
    
    -- Content Preferences
    tone_of_voice TEXT,
    target_audience TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_business_settings_workspace 
    ON business_settings(workspace_id);

CREATE INDEX IF NOT EXISTS idx_business_settings_industry 
    ON business_settings(industry);

CREATE INDEX IF NOT EXISTS idx_business_settings_updated_at 
    ON business_settings(updated_at DESC);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at timestamp automatically
DROP TRIGGER IF EXISTS update_business_settings_updated_at ON business_settings;
CREATE TRIGGER update_business_settings_updated_at 
    BEFORE UPDATE ON business_settings
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

-- Users can view business settings in their workspace
CREATE POLICY "Users can view business settings in their workspace"
    ON business_settings FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id FROM users WHERE id = auth.uid()
        )
    );

-- Users can create business settings for their workspace (if none exists)
CREATE POLICY "Users can create business settings for their workspace"
    ON business_settings FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM users WHERE id = auth.uid()
        )
    );

-- Admins and editors can update business settings
CREATE POLICY "Admins and editors can update business settings"
    ON business_settings FOR UPDATE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM users 
            WHERE id = auth.uid() AND role IN ('admin', 'editor')
        )
    );

-- Admins can delete business settings
CREATE POLICY "Admins can delete business settings"
    ON business_settings FOR DELETE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================
-- UPDATE WORKSPACE_INVITES SCHEMA
-- ============================================

-- Add status field if it doesn't exist (for better invite tracking)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'workspace_invites' AND column_name = 'status'
    ) THEN
        -- Add status column
        ALTER TABLE workspace_invites 
        ADD COLUMN status VARCHAR(20) DEFAULT 'pending';
        
        -- Update existing records based on is_accepted
        UPDATE workspace_invites 
        SET status = CASE 
            WHEN is_accepted = true THEN 'accepted'
            WHEN expires_at < NOW() THEN 'expired'
            ELSE 'pending'
        END;
        
        -- Create index on status
        CREATE INDEX idx_workspace_invites_status 
            ON workspace_invites(status);
    END IF;
END $$;

-- Add accepted_by column (different from accepted_by_user_id for clarity)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'workspace_invites' AND column_name = 'accepted_by'
    ) THEN
        ALTER TABLE workspace_invites 
        ADD COLUMN accepted_by UUID REFERENCES users(id) ON DELETE SET NULL;
        
        -- Copy existing data
        UPDATE workspace_invites 
        SET accepted_by = accepted_by_user_id 
        WHERE accepted_by_user_id IS NOT NULL;
    END IF;
END $$;

-- Add created_by column (better name than invited_by)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'workspace_invites' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE workspace_invites 
        ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE CASCADE;
        
        -- Copy existing data
        UPDATE workspace_invites 
        SET created_by = invited_by 
        WHERE invited_by IS NOT NULL;
    END IF;
END $$;

-- ============================================
-- ADD DESCRIPTION TO WORKSPACES
-- ============================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'workspaces' AND column_name = 'description'
    ) THEN
        ALTER TABLE workspaces 
        ADD COLUMN description TEXT;
    END IF;
END $$;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Grant authenticated users access to business_settings
GRANT SELECT, INSERT, UPDATE, DELETE ON business_settings TO authenticated;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

COMMENT ON TABLE business_settings IS 'Business profile and branding settings for workspaces';
COMMENT ON COLUMN business_settings.workspace_id IS 'Foreign key to workspaces table, unique constraint ensures one settings per workspace';
COMMENT ON COLUMN business_settings.social_links IS 'JSON object containing social media links: {twitter, linkedin, facebook, etc.}';
COMMENT ON COLUMN business_settings.brand_colors IS 'Array of hex color codes for brand colors';
COMMENT ON COLUMN business_settings.tone_of_voice IS 'Preferred tone for AI-generated content: professional, casual, friendly, etc.';
COMMENT ON COLUMN business_settings.target_audience IS 'Description of target audience for content generation';
