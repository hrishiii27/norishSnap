-- Database Blueprint for Supabase
-- Paste this directly into the Supabase SQL Editor to create your tables

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    daily_calorie_target INT DEFAULT 2000,
    protein_target_g INT DEFAULT 120,
    carbs_target_g INT DEFAULT 200,
    fats_target_g INT DEFAULT 60
);

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
    household_unit_label VARCHAR(50) DEFAULT 'katori',
    household_unit_weight_g INT DEFAULT 150,
    is_regional_specialty BOOLEAN DEFAULT FALSE,
    typical_cooking_medium_fat_g_per_100g NUMERIC(4,2) DEFAULT 0.00
);

CREATE TABLE meal_logs (
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
);

CREATE TABLE meal_log_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_log_id UUID REFERENCES meal_logs(id) ON DELETE CASCADE,
    food_name_logged VARCHAR(255) NOT NULL,
    reference_food_id UUID REFERENCES food_reference_dictionary(id) ON DELETE SET NULL,
    input_weight_grams NUMERIC(6,2) NOT NULL,
    selected_display_unit VARCHAR(50) DEFAULT 'grams',
    was_ai_predicted BOOLEAN DEFAULT TRUE,
    was_user_corrected BOOLEAN DEFAULT FALSE,
    original_ai_prediction_name TEXT,
    shadow_fat_override_applied BOOLEAN DEFAULT FALSE,
    calculated_calories INT NOT NULL,
    calculated_protein NUMERIC(5,2) NOT NULL,
    calculated_carbs NUMERIC(5,2) NOT NULL,
    calculated_fats NUMERIC(5,2) NOT NULL
);

CREATE TABLE user_smart_revision_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    detected_ai_trigger_phrase VARCHAR(255) NOT NULL,
    user_preferred_replacement_id UUID REFERENCES food_reference_dictionary(id) ON DELETE CASCADE,
    correction_count INT DEFAULT 1,
    last_corrected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, detected_ai_trigger_phrase)
);

CREATE INDEX idx_meal_logs_user_date ON meal_logs(user_id, logged_at DESC);
CREATE INDEX idx_revision_lookup ON user_smart_revision_memory(user_id, detected_ai_trigger_phrase);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- 1. Policies for users
CREATE POLICY "Users can manage their own profile" ON users
FOR ALL USING (auth.uid() = id);

-- 2. Policies for food_reference_dictionary
CREATE POLICY "Anyone can read food reference dictionary" ON food_reference_dictionary
FOR SELECT USING (true);

-- 3. Policies for meal_logs
CREATE POLICY "Users can manage their own meal logs" ON meal_logs
FOR ALL USING (auth.uid() = user_id);

-- 4. Policies for meal_log_items
CREATE POLICY "Users can manage their own meal log items" ON meal_log_items
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM meal_logs 
    WHERE meal_logs.id = meal_log_items.meal_log_id 
    AND meal_logs.user_id = auth.uid()
  )
);

-- 5. Policies for user_smart_revision_memory
CREATE POLICY "Users can manage their own revision memory" ON user_smart_revision_memory
FOR ALL USING (auth.uid() = user_id);
