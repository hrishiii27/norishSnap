-- Database Blueprint for Supabase
-- Paste this directly into the Supabase SQL Editor to create your tables

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    daily_calorie_target INT DEFAULT 2000,
    protein_target_g INT DEFAULT 120,
    carbs_target_g INT DEFAULT 200,
    fats_target_g INT DEFAULT 60,
    -- Streaks
    current_streak INT DEFAULT 0,
    longest_streak INT DEFAULT 0,
    last_logged_date DATE
);

-- Meal Templates (Quick Log)
CREATE TABLE meal_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    items JSONB NOT NULL,
    total_calories INT,
    total_protein NUMERIC(5,2),
    total_carbs NUMERIC(5,2),
    total_fats NUMERIC(5,2),
    use_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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

-- 1b. Room co-members can see each other's email
CREATE POLICY "Room co-members can view each other" ON users
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM room_members 
    WHERE room_members.user_id = users.id 
    AND room_members.room_id IN (SELECT get_user_member_rooms())
  )
);

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

-- 4b. Hosts can view meal items of room members
CREATE POLICY "Hosts can view member meal items" ON meal_log_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM meal_logs
    JOIN room_members ON room_members.user_id = meal_logs.user_id
    WHERE meal_logs.id = meal_log_items.meal_log_id
    AND room_members.room_id IN (SELECT get_user_hosted_rooms())
  )
);

-- 5. Policies for user_smart_revision_memory
CREATE POLICY "Users can manage their own revision memory" ON user_smart_revision_memory
FOR ALL USING (auth.uid() = user_id);

-- 6. Policies for meal_templates
ALTER TABLE meal_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their templates" ON meal_templates
FOR ALL USING (auth.uid() = user_id);

-- ==========================================
-- ROOMS FEATURE TABLES
-- ==========================================

CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    invite_code VARCHAR(20) UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE room_members (
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Host override targets
    target_calories INT,
    target_protein_g INT,
    target_carbs_g INT,
    target_fats_g INT,
    PRIMARY KEY (room_id, user_id)
);

CREATE TABLE room_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    invited_by UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, rejected
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (room_id, email)
);

CREATE TABLE room_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_log_id UUID REFERENCES meal_logs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- User who made the comment
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Note: Supabase Storage bucket 'room_meal_snaps' needs to be created manually or via Supabase dashboard/API.
-- Storage RLS for room_meal_snaps (Run in Supabase dashboard)
-- CREATE POLICY "Users can upload room snaps" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'room_meal_snaps');
-- CREATE POLICY "Room members and host can view snaps" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'room_meal_snaps');

-- Optional: pg_cron to clean up temporary room images older than 2 days
-- SELECT cron.schedule('cleanup-room-snaps', '0 0 * * *', $$
--    DELETE FROM storage.objects WHERE bucket_id = 'room_meal_snaps' AND created_at < NOW() - INTERVAL '2 days';
-- $$);

-- ==========================================
-- ROOMS FEATURE RLS POLICIES
-- ==========================================

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_comments ENABLE ROW LEVEL SECURITY;

-- Rooms: Hosts can do anything, Members can read rooms they are in
-- Helper Functions to Prevent RLS Infinite Recursion
CREATE OR REPLACE FUNCTION get_user_hosted_rooms()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM rooms WHERE host_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_user_member_rooms()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT room_id FROM room_members WHERE user_id = auth.uid();
$$;

CREATE POLICY "Hosts can manage their rooms" ON rooms
FOR ALL USING (auth.uid() = host_id);

CREATE POLICY "Members can view their rooms" ON rooms
FOR SELECT USING (
  id IN (SELECT get_user_member_rooms())
);

-- Room Members: Hosts can manage members, Members can view members of their room
CREATE POLICY "Hosts can manage room members" ON room_members
FOR ALL USING (
  room_id IN (SELECT get_user_hosted_rooms())
);

CREATE POLICY "Members can view room members and join" ON room_members
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can join a room" ON room_members
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Room Invites: Hosts can manage invites, Users can see their own invites
CREATE POLICY "Hosts can manage invites" ON room_invites
FOR ALL USING (
  room_id IN (SELECT get_user_hosted_rooms())
);

CREATE POLICY "Users can view their invites" ON room_invites
FOR SELECT USING (
  email = (SELECT email FROM users WHERE id = auth.uid())
);

CREATE POLICY "Users can update their invites" ON room_invites
FOR UPDATE USING (
  email = (SELECT email FROM users WHERE id = auth.uid())
);

-- Room Comments: Members and Hosts can read/write comments on meals in their room
CREATE POLICY "Users can manage comments" ON room_comments
FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can read comments on their meals" ON room_comments
FOR SELECT USING (
  EXISTS (SELECT 1 FROM meal_logs WHERE meal_logs.id = room_comments.meal_log_id AND meal_logs.user_id = auth.uid())
);

CREATE POLICY "Hosts can read comments in their room" ON room_comments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM meal_logs
    JOIN room_members ON room_members.user_id = meal_logs.user_id
    WHERE meal_logs.id = room_comments.meal_log_id AND room_members.room_id IN (SELECT get_user_hosted_rooms())
  )
);

-- UPDATED POLICY for meal_logs to allow Hosts to read logs of members in their room
CREATE POLICY "Hosts can view member meal logs" ON meal_logs
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM room_members
    WHERE room_members.user_id = meal_logs.user_id AND room_members.room_id IN (SELECT get_user_hosted_rooms())
  )
);

-- RPC Function for joining rooms securely by invite code
CREATE OR REPLACE FUNCTION join_room_by_code(p_invite_code text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_room_id uuid;
BEGIN
  -- Find the room by invite code
  SELECT id INTO v_room_id FROM rooms WHERE invite_code = p_invite_code;
  
  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;
  
  -- Insert membership (if they are already a member, ignore)
  INSERT INTO room_members (room_id, user_id) 
  VALUES (v_room_id, auth.uid())
  ON CONFLICT DO NOTHING;
  
  RETURN v_room_id;
END;
$$;
