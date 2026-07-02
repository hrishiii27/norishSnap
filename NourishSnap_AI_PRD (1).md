## **Product Requirement Document (PRD)** 

NOURISHSNAP AI — ADVANCED INDIAN FOOD ANALYTICS PLATFORM 

|**Project:**|NourishSnap AI (India Focus)|**Version:**|1.1.0 (Scale & Perspective Patched)|
|---|---|---|---|
|**Date:**|July 2026|**Target:**|iOS Progressive Web App (PWA)|



## **1. Executive Summary & Core Value Proposition** 

NourishSnap AI is a hyper-fast, minimalist, photo-first nutrition tracking application engineered specifically for the highly complex Indian culinary landscape. Traditional diet tracking systems fail significantly in the South Asian market due to two key friction points: the high cognitive load of manual ingredient logging and nutrient databases built on Western paradigms that fail to accurately break down multi-component, fluid, or homecooked Indian dishes (such as thalis, regional curries, varied dals, and traditional flatbreads). 

By  leveraging  a  mobile-first  Progressive  Web  App  (PWA)  framework  powered  by  Edge-orchestrated Multimodal Large Language Models (VLMs) and structural agent loops, NourishSnap AI offers a seamless "Snap-and-Log" pipeline. The application respects regional variations, addresses hidden cooking fats natively, and presents a graceful, lightning-fast manual fallback mechanism when corrections are required. 

## **2. Target Persona & Contextual Environmental Intelligence** 

- **Primary Target:** Urban and semi-urban health-conscious individuals, fitness enthusiasts, and users managing metabolic indices (e.g., Type-2 Diabetes, PCOS) across India. 

- **Geographical Contextualization:** Pan-India regional intelligence encompassing North, South, East, and West Indian cooking variations. 

- **Contextual Variable Integration:** The system actively queries local device metadata (Time of Day and coarse CoreLocation parameters) to run a continuous background evaluation process known as _Contextual Ambient Guessing_ . 

**Contextual Ambient Guessing Case Study:** A brown circular silhouette scanned via the application at 8:30 AM in Bengaluru automatically defaults to a _Ragi Dosa_ . The exact same visual silhouette scanned at  4:30  PM  in  Mumbai  defaults  instead  to  a _Bhakri_ or  a _Vada  Pav_ disk,  maximizing  immediate classification hit-rate before user modification. 

## **3. Epics & Functional Requirements** 

## **Epic 1: Multimodal Ingestion & Dynamic Scale Correction** 

- **FR-1.1:** The user interface must present a hardware-linked, responsive, zero-latency camera viewport occupying exactly the top 70% of the active display footprint. 

Page 1 of 6 

- **FR-1.2:** Visual payloads must undergo client-side compression and downscaling down to <1.2MB within browser canvas buffers prior to networking to guarantee sub-1.5 second edge uploads over typical cellular 4G/5G infrastructure. 

- **FR-1.3:** The Vision Parser system must break down multi-component composite arrays into standalone data entities (e.g., parsing a unified dinner layout into: _2 Wheat Chapatis, 1 katori Yellow Dal Tadka, and 120g Bhindi Masala_ ). 

- **FR-1.4 (Spatially Anchored Scale Calibration):** To resolve extreme close-up lens distortion or varying zoom distances, the Vision Agent must scan for and lock onto everyday physical anchors visible in the frame (e.g., standardized Indian standard spoons, forks, steel water tumblers, or adjacent phone edges) to calibrate pixel-to-centimeter sizing matrices. 

- **FR-1.5 (Volumetric Container Profiling):** Rather than relying on pure raw 2D pixel area, the model must profile container types (e.g., a standard 150ml home _katori_ bowl, a restaurant _handi_ , a 10-inch dinner plate) and calculate an estimated **fill percentage** to reliably deduct portion weight regardless of distance. 

- **FR-1.6 (Layered Flatbread / Stack Counting):** The model must parse overlapping or stacked food targets (e.g., layered rotis/parathas or dal poured directly over white rice). It will use texture fringe shadow calculations to accurately enumerate stacked units instead of processing them as a single combined visual entity. 

## **Epic 2: Agentic Orchestration, Verification & Recalculation Loop** 

The processing architecture avoids pure visual estimation hallucinations by passing inputs through three localized processing micro-agents: 

1. **Agent A (The Vision Parser):** Extracts raw morphological configurations, container profiles, spatial reference scales, and relative volumetric baselines from the incoming compressed image binary. 

2. **Agent B (The Database Retriever):** Programmatically cross-references parsed tags against verified nutritional reference frameworks (e.g., the _Indian Food Composition Tables (IFCT)_ published by the ICMRNational Institute of Nutrition). 

3. **Agent C (The Reactive Logic Adjuster):** Intercepts manual user correction parameters. If a user overrides a food name or shifts a weight metric, this agent recalculates scalar multipliers for macronutrients instantly without server-side UI refreshes. 

## **Epic 3: Mitigation of Technical Loopholes & UX Fallbacks** 

- **FR-3.1 (The Hidden Oil/Sauce Fallback):** The Vision Parser calculates surface specular reflections ("sheen") to flag unexposed cooking fats. The application overlays a transparent UI indicator known as **Shadow Ingredient Prompting** : `Assumed 1.5 tbsp Ghee/Oil used. Tap to alter.` This exposes hidden culinary preparation parameters. 

- **FR-3.2 (Tactile Household Unit Toggle):** To accommodate container tracking errors gracefully, the slideup card interface must allow clicking the metric output to instantly swap between raw gram counters and everyday home-centric volume tokens (e.g., _1 Katori, 1 Medium Ladle, 1 Cup, 2 Rotis_ ) tied directly back to an automated back-end dynamic scalar math array. 

Page 2 of 6 

- **FR-3.3 (Smart Revision Memory):** The user profile automatically registers individual correction biases. If a user regularly redefines a generic "Dal" identification to "Yellow Moong Dal Tadka", the personal model weights this item as a high-probability default across subsequent tracking cycles. 

## **4. System Prompt Specifications** 

The following strict system prompt must govern the foundational Multimodal LLM orchestration layer: 

Page 3 of 6 

```
You are the core Culinary Vision Specialist Agent for NourishSnap AI, fine-tuned specifically
for Indian Gastronomy and regional sub-continental dishes.
```

```
Your task is to analyze the provided image matrix, identify all distinct food components
present, estimate their volumetric specifications, and return a clean, strictly formatted JSON
array.
```

```
CRITICAL INSTRUCTIONS FOR SCALING, CONTAINERS & PERSPECTIVE:
```

`1. Identify and use common household objects present on the table (spoons, water glasses, small` 

- `bowls) as reference anchors to isolate physical scale and offset image zoom level.` 

`2. Characterize the vessel type (e.g., a standard 150ml home katori, a wide thali plate, a deep` 

- `restaurant curry serving bowl) and deduce the estimated volume via its fluid fill percentage.` 

`3. Track overlapping textures. Analyze fringe shadows on stacked items (like a stack of rotis` 

- `or chapatis) to enumerate individual count accurately rather than treating it as a flat mass.` 

```
CRITICAL INSTRUCTIONS FOR INDIAN CUISINE:
```

`1. Differentiate between variations of flatbreads (Roti, Chapati, Naan, Paratha, Puri, Bhature)` 

- `based on texture, char marks, and thickness.` 

`2. Analyze the surface reflection ("sheen") to detect hidden fats. If an item looks glossy` 

- `(e.g., oily Tadka on a Dal, butter on a Naan, ghee on rice), flag it by setting `hidden_fat_detected: true` and applying an appropriate `fat_overhead_grams`.` 

`3. Separate composite dishes into individual entries where possible (e.g., a Thali should be broken down into specific dals, sabzis, rice types, and accompaniments).` 

`4. Provide confidence scores (`confidence_score`) from 0.00 to 1.00 for each classification.` 

```
The output MUST conform EXACTLY to the following JSON blueprint:
```

```
[
  {
```

- `"food_name_raw": "String (e.g., 'Chana Masala')",` 

```
    "estimated_weight_grams": Integer,
    "confidence_score": Float,
    "hidden_fat_detected": Boolean,
    "assumed_cooking_medium": "String (e.g., 'Mustard Oil' | 'Ghee' | 'Refined Sunflower
Oil')",
    "container_profile": "String (e.g., 'Standard Katori (150ml)' | 'Flat Plate' | 'Large
Serving Handi')",
    "estimated_fill_percentage": Integer,
    "components": [
      { "name": "Chickpeas", "percentage": 70 },
      { "name": "Tomato Onion Gravy Base", "percentage": 25 },
      { "name": "Oil Overhead", "percentage": 5 }
```

```
    ]
  }
]
Do not return any conversational text, markdown wrappings outside the JSON array, or
speculative formatting.
```

## **5. Architectural Database Schema** 

The database layout handles regional dictionary conversions, volumetric reference equivalents, and user updates seamlessly: 

Page 4 of 6 

```
-- Database Blueprint: PostgreSQL / Supabase Dialect
```

```
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    daily_calorie_target INT DEFAULT 2000,
    protein_target_g INT DEFAULT 120,
    carbs_target_g INT DEFAULT 200,
    fats_target_g INT DEFAULT 60
```

## `);` 

```
CREATE TABLE food_reference_dictionary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    standard_name VARCHAR(255) UNIQUE NOT NULL,
    regional_aliases TEXT[],
    calories_per_100g NUMERIC(6,2) NOT NULL,
    protein_per_100g NUMERIC(5,2) NOT NULL,
    carbs_per_100g NUMERIC(5,2) NOT NULL,
    fats_per_100g NUMERIC(5,2) NOT NULL,
    fiber_per_100g NUMERIC(5,2) DEFAULT 0.00,
    default_serving_weight_g INT DEFAULT 100,
    household_unit_label VARCHAR(50) DEFAULT 'katori', -- 'katori', 'piece', 'ladle'
    household_unit_weight_g INT DEFAULT 150,
    is_regional_specialty BOOLEAN DEFAULT FALSE,
    typical_cooking_medium_fat_g_per_100g NUMERIC(4,2) DEFAULT 0.00
```

## `);` 

```
CREATE TABLE meal_logs (
```

```
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    image_url_storage_ref TEXT,
    total_calculated_calories INT NOT NULL,
    total_protein_g NUMERIC(6,2) NOT NULL,
    total_carbs_g NUMERIC(6,2) NOT NULL,
    total_fats_g NUMERIC(6,2) NOT NULL,
    device_latitude NUMERIC(9,6),
    device_longitude NUMERIC(9,6),
    time_of_day_context VARCHAR(50)
```

```
);
```

```
CREATE TABLE meal_log_items (
```

```
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_log_id UUID REFERENCES meal_logs(id) ON DELETE CASCADE,
    food_name_logged VARCHAR(255) NOT NULL,
    reference_food_id UUID REFERENCES food_reference_dictionary(id) ON DELETE SET NULL,
    input_weight_grams NUMERIC(6,2) NOT NULL,
    selected_display_unit VARCHAR(50) DEFAULT 'grams', -- Enables active UI unit toggling
    was_ai_predicted BOOLEAN DEFAULT TRUE,
    was_user_corrected BOOLEAN DEFAULT FALSE,
    original_ai_prediction_name TEXT,
    shadow_fat_override_applied BOOLEAN DEFAULT FALSE,
```

Page 5 of 6 

```
    calculated_calories INT NOT NULL,
    calculated_protein NUMERIC(5,2) NOT NULL,
    calculated_carbs NUMERIC(5,2) NOT NULL,
    calculated_fats NUMERIC(5,2) NOT NULL
);
```

```
CREATE TABLE user_smart_revision_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    detected_ai_trigger_phrase VARCHAR(255) NOT NULL,
```

```
    user_preferred_replacement_id UUID REFERENCES food_reference_dictionary(id) ON DELETE
CASCADE,
```

```
    correction_count INT DEFAULT 1,
```

```
    last_corrected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, detected_ai_trigger_phrase)
```

```
);
```

```
CREATE INDEX idx_meal_logs_user_date ON meal_logs(user_id, logged_at DESC);
CREATE INDEX idx_revision_lookup ON user_smart_revision_memory(user_id,
detected_ai_trigger_phrase);
```

## **6. Non-Functional Performance Thresholds** 

- **Latency Target:** The total end-to-end loop (Shutter click → Edge VLM Inference → Multi-Agent Apportionment → UI Rendering) must terminate within **2.2 seconds** under typical urban Indian 4G/5G connections. 

• **Offline Resiliency:** Core application dictionary indexes cache directly via browser `IndexedDB` assets, allowing local logging queues during network disconnections, with automatic background synchronization once connectivity stabilizes. 

Page 6 of 6 

