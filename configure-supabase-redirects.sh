#!/bin/bash
# Supabase Redirect URL Configuration Script
# This script configures the allowed redirect URLs in your Supabase project

# Get your project reference from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/general
PROJECT_REF="mptursickhanrmrblsxb"
ACCESS_TOKEN="your_supabase_access_token_here"

# Add redirect URLs via Supabase API
curl -X PATCH \
  https://api.supabase.com/v1/projects/$PROJECT_REF/auth/config \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "additional_redirect_urls": [
      "http://localhost:3000/auth/callback",
      "http://localhost:3001/auth/callback",
      "https://asi-team-link.vercel.app/auth/callback"
    ]
  }'
