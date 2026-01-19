export interface ContentPromptSuggestion {
    label: string;
    prompt: string;
}

export const contentPromptSuggestions: ContentPromptSuggestion[] = [
    // ==================== QUICK CONTENT CREATION ====================
    {
        label: "Create an Instagram post",
        prompt:
            `Create a complete Instagram post for my brand.

## Brand Details
- **Brand Name**: [Enter brand name]
- **Product/Topic**: [What this post is about]
- **Key Message**: [Main point to communicate]
- **Post Type**: [Feed post / Carousel / Reel]

## Deliverables Required
1. **Full Caption** - Ready to copy and paste
2. **Visual Concept** - Description of image/video
3. **Imagen Prompt** - Ready-to-use image generation prompt (4:5 aspect ratio)
4. **Veo Prompt** - Video prompt if Reel (9:16 aspect ratio)
5. **Hashtags** - 5-7 brand-appropriate tags

Load the instagram skill first. Reference Nike, Zara, L'Oréal style.`,
    },
    {
        label: "Create a TikTok video",
        prompt:
            `Create a complete TikTok video concept for my brand (enterprise brand style, not viral creator).

## Brand Details
- **Brand Name**: [Enter brand name]
- **Product to Feature**: [Product name]
- **Video Goal**: [Product showcase / Behind-the-scenes / Launch]

## Deliverables Required
1. **Video Script** - Second-by-second breakdown (15-30 sec)
2. **Caption** - Short, professional caption
3. **Veo Prompt** - Video generation prompt (9:16)
4. **Runway Prompt** - Alternative video prompt
5. **Hashtags** - 3-5 brand tags (no #fyp)

Load the tiktok skill first. Reference Nike, Zara brand TikTok (not influencer style).`,
    },
    {
        label: "Create a LinkedIn post",
        prompt:
            `Create a complete LinkedIn post for my company.

## Company Details
- **Company Name**: [Enter company name]
- **Post Topic**: [Product launch / Corporate news / Thought leadership]
- **Key Message**: [Main point to communicate]

## Deliverables Required
1. **Full Post Copy** - Professional formatted LinkedIn post
2. **Visual Concept** - Description of accompanying image
3. **Imagen Prompt** - Corporate/professional image prompt (1:1 or 4:5)
4. **CTA** - Appropriate call-to-action
5. **Hashtags** - 3-5 professional hashtags

Load the linkedin skill first. Reference Nike, L'Oréal, Apple corporate style.`,
    },
    {
        label: "Create a YouTube Short",
        prompt:
            `Create a complete YouTube Short for my brand.

## Brand Details
- **Brand Name**: [Enter brand name]
- **Product/Topic**: [What to feature]
- **Content Type**: [Product demo / Behind-the-scenes / Quick tip]

## Deliverables Required
1. **Script** - Second-by-second breakdown (15-60 sec)
2. **Description** - YouTube description with timestamps
3. **Veo Prompt** - Video generation prompt (9:16)
4. **Thumbnail Concept** - What the thumbnail should show
5. **Imagen Prompt** - Thumbnail image prompt

Load the youtube skill first. Reference enterprise brand YouTube style.`,
    },

    // ==================== PRODUCT LAUNCHES ====================
    {
        label: "Product launch campaign",
        prompt:
            `Create a complete product launch campaign.

## Brand Details
- **Brand Name**: [Enter brand name]
- **Brand Category**: [Fashion / Beauty / Sportswear / Luxury]
- **Product Name**: [Product being launched]
- **Key Features**: [Top 3 features]
- **Launch Date**: [When]

## Deliverables Required

### 1. Campaign Strategy
- Pre-launch (3 days), Launch day, Post-launch timeline
- Key messages

### 2. Complete Posts (5 posts across platforms)
For each post provide:
- Platform and format
- Full caption (ready to copy)
- Visual concept
- Imagen or Veo prompt
- Hashtags

### 3. Campaign Hashtag Strategy
- Brand hashtag
- Campaign hashtag

Load the instagram, tiktok, and advertising skills.
Reference Nike, Zara product launch campaigns.`,
    },
    {
        label: "Product announcement post",
        prompt:
            `Create a single product announcement post with full assets.

## Brand Details
- **Brand Name**: [Enter brand name]
- **Product**: [Product name]
- **Key Benefit**: [Main value proposition]
- **Platform**: [Instagram / LinkedIn / Twitter / Facebook]
- **Availability**: [Where and when available]

## Deliverables Required
1. **Full Caption** - Professional brand tone, benefit-focused
2. **Visual Concept** - Hero product shot description
3. **Imagen Prompt** - Product photography prompt (specify aspect ratio)
4. **Veo Prompt** - Product showcase video prompt
5. **Hashtags** - 3-5 brand-appropriate tags
6. **CTA** - Professional call-to-action

Load the relevant platform skill. Reference Nike, Zara announcement style.`,
    },

    // ==================== SEASONAL & CAMPAIGNS ====================
    {
        label: "Seasonal collection campaign",
        prompt:
            `Create a complete seasonal collection campaign.

## Brand Details
- **Brand Name**: [Enter brand name]
- **Season**: [Spring/Summer or Fall/Winter + Year]
- **Collection Theme**: [Theme or name]
- **Hero Products**: [3-5 key pieces]

## Deliverables Required

### 1. Campaign Strategy
- Collection positioning
- 2-week content calendar

### 2. Complete Instagram Posts (6 posts)
For each post:
- Caption (ready to copy)
- Visual concept
- Imagen prompt (4:5)
- Hashtags

### 3. TikTok Videos (3 videos)
For each:
- Script with timing
- Veo prompt (9:16)
- Caption and hashtags

### 4. Lookbook Prompts
- 5 Imagen prompts for lookbook imagery

Load instagram, tiktok skills. Reference Zara seasonal campaigns.`,
    },
    {
        label: "Holiday campaign",
        prompt:
            `Create a complete holiday campaign.

## Brand Details
- **Brand Name**: [Enter brand name]
- **Holiday**: [Black Friday / Christmas / Valentine's / etc.]
- **Campaign Duration**: [Start to end date]
- **Featured Products**: [What to highlight]
- **Offer/Message**: [Promotion or brand message]

## Deliverables Required

### 1. Campaign Timeline
- Content calendar for full campaign

### 2. Complete Posts (5 posts)
For each:
- Platform
- Full caption (ready to copy)
- Visual concept
- Imagen prompt with holiday aesthetic
- Hashtags

### 3. Stories/Ephemeral Content Plan
- Daily story concepts

### 4. Email Subject Lines (5 options)

Load platform skills. Reference premium brand holiday campaigns.`,
    },

    // ==================== VIDEO & ADS ====================
    {
        label: "Video ad script (15/30/60 sec)",
        prompt:
            `Create a complete video ad script with production assets.

## Brand Details
- **Brand Name**: [Enter brand name]
- **Product**: [Product to feature]
- **Ad Duration**: [15 / 30 / 60 seconds]
- **Platform**: [TikTok / Instagram / YouTube / TV]
- **Key Message**: [Main takeaway]

## Deliverables Required

### 1. Full Script
- Second-by-second breakdown
- Visual description for each scene
- Audio/voiceover direction
- On-screen text

### 2. Video Generation Prompts
- Veo prompt for each scene
- Sora prompt alternative
- Runway prompt for motion elements

### 3. Thumbnail/First Frame
- Imagen prompt for thumbnail

### 4. Ad Copy
- Headline options (3)
- Description
- CTA

Load the advertising skill. Reference Nike, L'Oréal commercials.`,
    },
    {
        label: "Social media ad copy",
        prompt:
            `Create complete social media ad copy package.

## Brand Details
- **Brand Name**: [Enter brand name]
- **Product**: [Product being advertised]
- **Platform**: [Meta / TikTok / LinkedIn / YouTube]
- **Campaign Goal**: [Awareness / Traffic / Conversions]
- **Key Benefit**: [Main value proposition]

## Deliverables Required

### 1. Ad Copy Variations (5 versions)
For each version:
- Primary text
- Headline
- Description
- CTA button text

### 2. Visual Creative
- Image concept description
- Imagen prompt

### 3. Video Ad Option
- 15-second script
- Veo prompt

### 4. A/B Testing Recommendations
- Which elements to test

Load the advertising skill. Reference enterprise brand ad standards.`,
    },

    // ==================== VISUAL CONTENT ====================
    {
        label: "Product photography prompts",
        prompt:
            `Generate complete product photography AI prompts.

## Product Details
- **Product**: [Product name and description]
- **Category**: [Fashion / Beauty / Footwear / Tech]
- **Key Features**: [What to highlight]
- **Platform Use**: [Instagram / Website / Advertising]

## Deliverables Required

Generate 6 different shot types with ready-to-use prompts:

1. **Hero Product Shot** (4:5)
   - Clean product-focused, studio lighting

2. **Lifestyle Shot** (4:5)
   - Product in aspirational context

3. **Detail Close-Up** (1:1)
   - Texture, material, craftsmanship

4. **Product in Use** (4:5)
   - Model/hands using product

5. **Collection/Flat Lay** (1:1)
   - Multiple products or colorways

6. **Campaign Hero** (16:9)
   - Creative advertising concept

For each: Complete Imagen prompt with lighting, style, and aspect ratio.

Load the google-imagen skill. Reference Nike, L'Oréal product photography.`,
    },
    {
        label: "Brand video prompts",
        prompt:
            `Generate complete brand video AI prompts.

## Video Details
- **Brand Name**: [Enter brand name]
- **Product/Subject**: [What to feature]
- **Purpose**: [Social content / Advertising / Website]
- **Platform**: [Instagram Reels / TikTok / YouTube]

## Deliverables Required

Generate 4 different video concepts:

1. **Product Reveal** (9:16)
   - Elegant product showcase with orbit/reveal

2. **Lifestyle Moment** (9:16)
   - Product in aspirational context

3. **Detail/Craft** (1:1)
   - Texture, material, close-up motion

4. **Brand Film Opening** (16:9)
   - Cinematic campaign opening

For each:
- Video concept description
- Veo prompt (ready to use)
- Sora prompt (alternative)
- Runway prompt (for motion)
- Duration and aspect ratio

Load google-veo, openai-sora, runway-gen4 skills.`,
    },

    // ==================== STRATEGY ====================
    {
        label: "Weekly content plan",
        prompt:
            `Create a complete weekly content plan with full assets.

## Brand Details
- **Brand Name**: [Enter brand name]
- **Category**: [Fashion / Beauty / Sportswear / Food / Tech]
- **Current Priority**: [Product launch / Seasonal / Awareness]
- **Primary Platform**: [Instagram / TikTok / LinkedIn]

## Deliverables Required

### 1. Weekly Calendar
- 7 days of content
- Post times and formats

### 2. Complete Posts (All 7 days)
For each post:
- Platform and format
- Full caption (ready to copy)
- Visual concept
- Imagen or Veo prompt
- Hashtags

### 3. Stories Plan
- Daily story concepts

### 4. Content Theme Architecture
- What each day focuses on

Load the relevant platform skill. Reference enterprise brand content strategy.`,
    },
    {
        label: "Content strategy framework",
        prompt:
            `Create a complete content strategy framework.

## Brand Details
- **Brand Name**: [Enter brand name]
- **Industry**: [Category]
- **Target Audience**: [Demographics and psychographics]
- **Brand Positioning**: [How brand positions itself]
- **Active Platforms**: [Which platforms]

## Deliverables Required

### 1. Content Pillars (4-5)
- Pillar name and description
- Content types per pillar
- Posting frequency

### 2. Brand Voice Guidelines
- Tone attributes (with examples)
- Language do's and don'ts
- Example captions for each tone

### 3. Visual Standards
- Photography style direction
- Video approach
- Imagen prompt templates for each style

### 4. Platform Strategy
- Approach for each platform
- Content mix percentages

### 5. Sample Content
- 1 complete post example per pillar
- Including caption, visual, and AI prompts

Load social-media master skill for reference.`,
    },

    // ==================== BRAND BUILDING ====================
    {
        label: "Brand storytelling content",
        prompt:
            `Create complete brand storytelling content.

## Brand Details
- **Brand Name**: [Enter brand name]
- **Story Type**: [Heritage / Craftsmanship / Innovation / Values]
- **Specific Story**: [What story to tell]
- **Platform**: [Instagram / LinkedIn / YouTube]

## Deliverables Required

### 1. Story Framework
- Narrative arc
- Key messages

### 2. Complete Content Series (4 posts)
For each:
- Full caption (ready to copy)
- Visual concept
- Imagen or Veo prompt
- Hashtags

### 3. Long-Form Option
- YouTube video script outline
- Veo prompts for key scenes

Load platform skill. Reference luxury brand storytelling (Hermès, Louis Vuitton).`,
    },
    {
        label: "Sustainability content",
        prompt:
            `Create complete sustainability/ESG content.

## Brand Details
- **Brand Name**: [Enter brand name]
- **Initiative**: [Specific sustainability effort]
- **Proof Points**: [Data, certifications, achievements]
- **Platform**: [LinkedIn / Instagram / All]

## Deliverables Required

### 1. Messaging Framework
- Key claims (substantiated)
- Proof points to highlight

### 2. Complete Posts (3 posts)
For each:
- Full caption (authentic, not greenwashing)
- Visual concept
- Imagen prompt

### 3. LinkedIn Long-Form
- Article outline
- Key data visualizations needed

Load linkedin skill for corporate content.
Reference Nike "Move to Zero", L'Oréal sustainability style.`,
    },

    // ==================== COLLABORATIONS ====================
    {
        label: "Collaboration announcement",
        prompt:
            `Create a complete collaboration/ambassador announcement.

## Collaboration Details
- **Brand Name**: [Enter brand name]
- **Partner/Ambassador**: [Name]
- **Collaboration Type**: [Product collab / Ambassador / Partnership]
- **Featured Products**: [If applicable]

## Deliverables Required

### 1. Announcement Strategy
- Teaser content
- Launch content
- Sustain content

### 2. Complete Posts (4 posts)
For each:
- Platform
- Full caption (ready to copy)
- Visual concept
- Imagen prompt
- Hashtags

### 3. Video Announcement
- 30-second script
- Veo prompt

### 4. Campaign Hashtag

Load platform skills. Reference Nike athlete announcements, beauty brand ambassador launches.`,
    },
    {
        label: "Limited edition launch",
        prompt:
            `Create a complete limited edition product launch.

## Product Details
- **Brand Name**: [Enter brand name]
- **Limited Edition Product**: [Name and description]
- **What Makes It Special**: [Unique story or features]
- **Availability**: [Quantity, duration, where]
- **Launch Date**: [When]

## Deliverables Required

### 1. Launch Strategy
- Pre-launch hype (3 days)
- Launch day activation
- Scarcity messaging (authentic, not hyperbolic)

### 2. Complete Posts (5 posts)
For each:
- Platform
- Full caption
- Visual concept
- Imagen prompt
- Hashtags

### 3. Countdown Content
- Stories template
- Imagen prompts

### 4. Email Announcement
- Subject line options (3)
- Email body copy

Load advertising and platform skills. Reference Nike drop culture, Zara limited editions.`,
    },

    // ==================== REAL ESTATE MARKETING ====================
    {
        label: "Property listing post",
        prompt:
            `Create a complete property listing social media post.

## Property Details
- **Agency/Brand Name**: [Real estate company name]
- **Property Type**: [House / Apartment / Condo / Commercial]
- **Location**: [City, neighborhood]
- **Key Features**: [Bedrooms, bathrooms, sq ft, special features]
- **Price**: [Listing price or "Contact for pricing"]
- **Platform**: [Instagram / Facebook / LinkedIn]

## Deliverables Required

1. **Full Caption** - Professional, compelling property description
2. **Key Selling Points** - Bullet-style feature highlights
3. **Visual Concept** - Description of property showcase image
4. **Imagen Prompt** - Luxury real estate photography prompt (4:5)
5. **Video Prompt** - Property walkthrough video prompt (9:16)
6. **Hashtags** - Location and real estate hashtags
7. **CTA** - "Schedule a viewing", "DM for details", etc.

Reference: Luxury real estate brands (Sotheby's, Christie's style).
Load the instagram skill for optimization.`,
    },
    {
        label: "Property virtual tour video",
        prompt:
            `Create a complete property virtual tour video with AI prompts.

## Property Details
- **Agency Name**: [Real estate company name]
- **Property Type**: [House / Apartment / Penthouse]
- **Property Style**: [Modern / Classic / Luxury / Contemporary]
- **Key Rooms**: [List main areas to feature]
- **Unique Features**: [Pool, view, smart home, etc.]

## Deliverables Required

### 1. Video Script (60-90 seconds)
- Room-by-room walkthrough with timing
- Voiceover/text overlay suggestions
- Transition points

### 2. Video Generation Prompts
For each room/scene:
- Veo prompt for walkthrough
- Camera movements (dolly, pan, reveal)
- Lighting description

### 3. Thumbnail
- Imagen prompt for video thumbnail (hero exterior or interior)

### 4. Social Captions
- Instagram/Facebook caption
- YouTube description

Reference: Luxury property tour videos.
Load google-veo and advertising skills.`,
    },
    {
        label: "New development launch campaign",
        prompt:
            `Create a complete new real estate development launch campaign.

## Development Details
- **Developer/Agency**: [Company name]
- **Project Name**: [Development name]
- **Property Type**: [Residential / Mixed-use / Commercial]
- **Location**: [City, area]
- **Unit Types**: [Studios, 1-bed, 2-bed, penthouses, etc.]
- **Key Selling Points**: [Amenities, location benefits, investment value]
- **Launch Date**: [When]

## Deliverables Required

### 1. Campaign Strategy
- Pre-launch teaser phase
- Launch day content
- Ongoing nurture content

### 2. Complete Posts (6 posts)
For each:
- Platform (Instagram, Facebook, LinkedIn)
- Full caption
- Visual concept
- Imagen prompt (architectural visualization style)
- Hashtags

### 3. Video Content
- 30-second teaser script
- Veo prompt for development showcase

### 4. Digital Ad Copy
- Facebook/Instagram ad headlines (5 options)
- Ad descriptions
- CTA options

Load advertising skill. Reference luxury development marketing.`,
    },
    {
        label: "Real estate agent personal brand",
        prompt:
            `Create personal branding content for a real estate agent.

## Agent Details
- **Agent Name**: [Name]
- **Brokerage**: [Company name]
- **Specialty**: [Luxury homes / First-time buyers / Commercial / Investment]
- **Service Area**: [City/region]
- **Unique Value Proposition**: [What sets you apart]

## Deliverables Required

### 1. Bio/About Copy
- Instagram bio (150 characters)
- LinkedIn summary
- Website about section

### 2. Content Pillars (4 themes)
- What to post about consistently

### 3. Complete Posts (5 posts)
For each:
- Post type (market update, tips, listing, personal, testimonial)
- Full caption
- Visual concept
- Imagen prompt
- Hashtags

### 4. Professional Headshot Direction
- Imagen prompt for professional real estate photo
- LinkedIn banner prompt

Reference: Top-producing luxury agents on Instagram.
Load instagram and linkedin skills.`,
    },
    {
        label: "Open house campaign",
        prompt:
            `Create a complete open house marketing campaign.

## Open House Details
- **Agency Name**: [Company name]
- **Property Address**: [Location]
- **Property Highlights**: [Key features]
- **Date/Time**: [When]
- **Agent Hosting**: [Name]

## Deliverables Required

### 1. Announcement Posts (3 versions)
For each:
- Full caption with date/time/address
- Visual concept
- Imagen prompt (inviting property exterior/interior)
- Hashtags

### 2. Stories Content
- Countdown series (3 days before)
- Day-of Stories sequence
- Imagen prompts for each

### 3. Reminder Posts
- 24-hour reminder caption
- Same-day reminder caption

### 4. Post-Event Content
- "In case you missed it" post
- Highlight reel concept

### 5. Print-Ready Copy
- Flyer headline and copy

Load instagram skill. Reference professional real estate open house marketing.`,
    },

    // ==================== READY-TO-USE EXAMPLES (Ultra-Detailed) ====================
    {
        label: "Example: Beauty lip product campaign",
        prompt:
            `Generate an ultra-detailed image prompt for a beauty lip product campaign.

## Product Details
- **Brand Style**: Rhode / Glossier aesthetic
- **Product**: Peptide Lip Tint in dusty rose shade
- **Campaign Style**: Editorial beauty, high-end

## Ready-to-Use Image Prompt

Ultra realistic studio portrait photo, close-up side profile of an elegant young woman, sleek glossy hair in a low bun, natural everyday makeup, smooth skin with subtle glow, wearing a white textured blazer with a modest neckline and long sleeves. Minimal gold jewelry: thin chain necklace with a small oval pendant, small gold hoop and tiny stud earrings.

Beauty campaign pose: she is holding a dusty-rose squeeze tube lip product in her hand (Rhode Peptide Lip Tint style), matte soft plastic tube, muted pink terracotta color, vertical white logo clearly readable, small white text "PEPTIDE LIP TINT", minimal clean packaging, ribbed sealed top edge, rounded matching cap, slanted applicator tip.

The product is near her mouth, gently held between her front teeth while her lips are half-closed and glossy, subtle natural shine on the lips, soft reflection highlights, realistic texture. Her left hand gently covers her eyes and upper face (hand in focus), clean manicure with short oval nails painted dark chocolate brown.

Minimalistic light gray studio background, soft diagonal sunlight and gentle shadows on the wall, editorial fashion photography, high-end campaign look, 85mm lens, shallow depth of field, ultra sharp details, natural skin texture, realistic lighting, RAW photo, professional studio shot, realistic hands, correct anatomy, five fingers, no distortion, no extra fingers, no text errors, product label sharp and readable.

4:5 aspect ratio.

---

Also provide a **15-second video version** (2 shots) using the same aesthetic.`,
    },
    {
        label: "Example: Athletic wear campaign",
        prompt:
            `Generate an ultra-detailed image prompt for Nike-style athletic wear campaign.

## Product Details
- **Brand Style**: Nike / Adidas premium athletic
- **Product**: Running leggings and sports bra set in black
- **Campaign Style**: Dynamic sports editorial

## Ready-to-Use Image Prompt

Ultra realistic action photography, fit athletic woman mid-stride in a powerful running pose, toned physique, confident determined expression, hair pulled back in a sleek high ponytail with loose strands catching the light.

Wearing premium black compression running leggings with subtle mesh ventilation panels along outer thigh, reflective Nike swoosh on left hip, high-waisted fit showing defined abs. Matching black racerback sports bra with crossed strap detail on back, medium support with subtle logo placement on chest.

Nike Pegasus running shoes in black/volt colorway visible in stride, responsive foam midsole visible, shoe in sharp focus showing mesh texture and lacing detail.

Urban sunrise setting: wide downtown street at golden hour, long shadows stretching across wet pavement after rain, city buildings silhouetted in warm orange and pink sky background, lens flare from rising sun creating rim lighting around athlete's silhouette.

Dynamic low angle camera position, slight motion blur on background while athlete remains sharp, dramatic side lighting emphasizing muscle definition and fabric texture, cinematic sports photography, campaign quality, shot on Sony A7IV 70-200mm f/2.8, shallow depth of field on background, ultra sharp details on athlete and product, professional color grading with warm tones, sweat droplets visible on skin, authentic athletic movement, powerful energy.

16:9 aspect ratio for hero banner, also provide 9:16 crop for Instagram Story.

---

Also provide a **30-second video version** (4 shots) showing warm-up to full sprint sequence.`,
    },
    {
        label: "Example: Luxury real estate property",
        prompt:
            `Generate an ultra-detailed image prompt for luxury real estate listing.

## Property Details
- **Property Type**: Modern luxury penthouse
- **Location Style**: Miami / Dubai high-rise aesthetic
- **Price Range**: $5M+ luxury segment

## Ready-to-Use Image Prompt

Ultra realistic architectural interior photography, expansive open-plan luxury penthouse living space, floor-to-ceiling windows spanning entire wall with panoramic ocean view, late afternoon golden hour light streaming in creating warm ambient glow throughout space.

Interior features: polished white Italian marble floors with subtle grey veining, 12-foot ceilings with recessed LED lighting on warm setting, floating Italian modern sectional sofa in cream boucle fabric arranged facing windows, oval white marble coffee table with brass base, sculptural art pieces on display pedestals, large abstract painting in neutral tones on feature wall.

Kitchen visible in background: waterfall edge white Calacatta marble island with integrated cooktop, brass fixtures, built-in wine fridge, top-tier Gaggenau appliances in stainless steel, pendant lights in brushed gold finish over island.

Private terrace visible through sliding glass doors: infinity edge plunge pool, outdoor lounge furniture in grey all-weather fabric, mature olive tree in architectural planter, city skyline visible in distance with sunset colors reflecting off neighboring glass towers.

Details: fresh white orchid arrangement on coffee table, interior design magazine casually placed, remote control and coaster suggesting lived-in luxury, sheer white curtains gently moving from breeze through open terrace door.

Shot with tilt-shift lens to control perspective, wide angle 24mm composition showing full space and view, professional real estate photography lighting with flash fill balanced with natural window light, HDR processing for balanced exposure, ultra sharp details throughout, Sotheby's International Realty campaign quality, aspirational lifestyle staging.

4:5 aspect ratio for Instagram, also provide 16:9 for website hero.

---

Also provide a **45-second video walkthrough** (6 shots) with smooth transitions through the space.`,
    },
    {
        label: "Example: Skincare serum product",
        prompt:
            `Generate an ultra-detailed image prompt for luxury skincare serum.

## Product Details
- **Brand Style**: L'Oréal / Estée Lauder luxury skincare
- **Product**: Vitamin C brightening serum in glass dropper bottle
- **Campaign Style**: Scientific luxury beauty

## Ready-to-Use Image Prompt

Ultra realistic product photography, premium glass dropper bottle containing golden-amber vitamin C serum, cylindrical bottle with thick glass base, silver metallic dropper cap with rubber squeeze top, gold liquid visible through clear glass with tiny suspended particles catching light.

The dropper is lifted out of bottle, held at angle above, single perfect golden drop forming at glass pipette tip about to fall, light refracting through liquid creating prismatic effect, serum texture visible as slightly viscous consistency.

Product placed on white Carrara marble surface with soft grey veining, fresh orange slices arranged artistically in background (out of focus), green botanical leaves adding organic accent, small clear glass petri dish nearby containing golden serum pool showing texture.

Lighting setup: soft diffused key light from upper left creating gentle gradient on bottle, rim light from behind creating glow through amber liquid, reflector fill from right side preventing harsh shadows, subtle caustic light patterns on marble from light passing through serum.

Background: pure white seamless studio backdrop with soft shadow beneath bottle grounding product, clean minimalist composition, product as hero with 60% frame presence.

Ultra macro detail on serum drop, 100mm macro lens, f/8 for depth of field covering bottle while maintaining soft background, professional beauty product photography, advertising campaign quality, no reflections showing equipment, clean retouching, luxury skincare brand aesthetic.

1:1 square aspect ratio for Instagram feed hero.

---

Also provide a **texture video** (7-second single shot) showing serum drop falling into palm and spreading.`,
    },
    {
        label: "Example: Modern apartment listing",
        prompt:
            `Generate an ultra-detailed image prompt for modern apartment real estate listing.

## Property Details
- **Property Type**: Urban loft apartment
- **Style**: Industrial modern
- **Target Buyer**: Young professionals

## Ready-to-Use Image Prompt

Ultra realistic interior photography, spacious industrial loft apartment with soaring 16-foot exposed brick walls in warm terracotta tones, original timber ceiling beams in dark walnut stain, polished concrete floors with subtle grey patina and area rugs defining living zones.

Main living area: modular grey velvet sectional sofa facing exposed brick feature wall, mounted 65-inch TV on minimalist black steel bracket, floating oak shelving displaying curated books and plants, vintage leather armchair in cognac brown adding warmth, large potted fiddle leaf fig tree in corner.

Open kitchen area: matte black cabinetry with brass hardware, butcher block countertops on island, open industrial shelving with ceramic dishes and glassware displayed, stainless steel appliances, hanging industrial pendant lights with Edison bulbs over breakfast bar with three black metal bar stools.

Large steel-frame windows with black muntins spanning wall, afternoon light creating dramatic shadow patterns across brick wall and floors, view of urban neighborhood rooftops and trees visible through windows, sheer white linen curtains adding softness.

Bedroom visible through open doorway: king bed with white bedding and textured throw pillows, nightstands with ceramic table lamps, clothes rack with curated wardrobe visible.

Details: coffee table with design books and ceramic vase with dried pampas grass, laptop half-closed on sofa arm suggesting work-from-home lifestyle, yoga mat rolled in corner, plants throughout adding life.

Wide angle 16mm lens, tripod mounted for sharpness throughout, professional real estate photography with supplemental flash, warm color temperature editing, lifestyle staging that appeals to young professionals, Airbnb Plus / Compass listing quality.

4:5 aspect ratio for Instagram, 3:2 for Zillow listing.

---

Also provide a **30-second apartment tour video** (4 shots) highlighting key features.`,
    },
    {
        label: "Example: Luxury watch campaign",
        prompt:
            `Generate an ultra-detailed image prompt for luxury watch advertising.

## Product Details
- **Brand Style**: Rolex / Omega luxury timepiece
- **Product**: Steel sports watch with blue dial
- **Campaign Style**: Aspirational lifestyle

## Ready-to-Use Image Prompt

Ultra realistic product photography, premium stainless steel diving watch on male wrist, Oyster-style bracelet with polished center links and brushed outer links, ceramic unidirectional bezel in deep navy blue with platinum minute markers, matching sunburst blue dial with applied hour markers in white gold, luminescent hands and indices, date window at 3 o'clock with cyclops magnifier, screw-down crown with crown guards.

Wrist and hand visible: well-groomed masculine hand, natural skin texture with visible fine hairs, clean short fingernails, subtle veins visible on wrist, watch worn properly on left wrist with crown facing hand, bracelet fitting perfectly with one finger gap.

Setting: yacht deck scene, teak wood decking visible in foreground, stainless steel cleat nearby, coiled rope in nautical blue and white, Mediterranean turquoise water visible in background bokeh, white hull of yacht edge visible, golden afternoon sailing light.

The hand is gripping yacht control or holding beverage glass (whiskey with single ice cube), suggesting affluent yachting lifestyle, no face visible (just forearm and hand), casual weekend sailing attire suggested by rolled shirt sleeve visible at wrist edge.

Lighting: natural outdoor light with soft clouds providing diffusion, watch dial catching light to show sunburst pattern, anti-reflective crystal coating eliminating glare while showing dial clearly, subtle reflections in polished steel surfaces, bezel numerals sharp and legible.

Medium close-up composition, 85mm lens at f/4 for background separation while keeping watch sharp, lifestyle luxury advertising, nautical aspirational setting, Rolex campaign quality, authentic luxury market appeal.

4:5 aspect ratio for print and Instagram.

---

Also provide a **15-second video** (2 shots) showing watch reveal and wrist shot with yacht movement.`,
    },
];

const shuffle = <T,>(items: T[]): T[] => {
    const array = [...items];
    for (let i = array.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

export const getRandomPromptSuggestions = (count: number): ContentPromptSuggestion[] => {
    if (count <= 0) return [];
    return shuffle(contentPromptSuggestions).slice(0, Math.min(count, contentPromptSuggestions.length));
};
