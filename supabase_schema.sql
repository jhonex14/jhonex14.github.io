-- Supabase Schema for ConsulTime

-- 1. Create Profiles Table (extends Supabase Auth)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT CHECK (role IN ('student', 'faculty', 'admin')) NOT NULL DEFAULT 'student',
    department TEXT,
    id_number TEXT,
    address TEXT,
    age INTEGER,
    avatar TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT true,
    school_year TEXT,
    section TEXT,
    active_session_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile." ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users or Admin can update profiles" ON public.profiles FOR UPDATE USING (
    auth.uid() = id 
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admin can delete profiles" ON public.profiles FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 2. Create Faculty Availability Table
CREATE TABLE public.faculty_availability (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    faculty_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6) NOT NULL, -- 0=Sunday, 1=Monday...
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.faculty_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Availability is viewable by everyone" ON public.faculty_availability FOR SELECT USING (true);
CREATE POLICY "Faculty or Admin can insert availability" ON public.faculty_availability FOR INSERT WITH CHECK (
    auth.uid() = faculty_id 
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Faculty or Admin can update availability" ON public.faculty_availability FOR UPDATE USING (
    auth.uid() = faculty_id 
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Faculty or Admin can delete availability" ON public.faculty_availability FOR DELETE USING (
    auth.uid() = faculty_id 
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 3. Create Appointments Table
CREATE TABLE public.appointments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    faculty_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    appointment_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    purpose TEXT NOT NULL,
    status TEXT CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')) DEFAULT 'pending' NOT NULL,
    faculty_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view appointments" ON public.appointments FOR SELECT USING (true);
CREATE POLICY "Students or Admin can create appointments" ON public.appointments FOR INSERT WITH CHECK (
    auth.uid() = student_id 
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users or Admin can update appointments" ON public.appointments FOR UPDATE USING (
    auth.uid() = student_id 
    OR 
    auth.uid() = faculty_id 
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admin can delete appointments" ON public.appointments FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 4. Create Faculty Weekly Reports Table
CREATE TABLE public.faculty_reports (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    faculty_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    total_requests INTEGER NOT NULL DEFAULT 0,
    pending_requests INTEGER NOT NULL DEFAULT 0,
    approved_requests INTEGER NOT NULL DEFAULT 0,
    completed_requests INTEGER NOT NULL DEFAULT 0,
    report_notes TEXT,
    raw_snapshot JSONB
);

ALTER TABLE public.faculty_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Faculty or Admin can view weekly reports" ON public.faculty_reports FOR SELECT USING (
    auth.uid() = faculty_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Faculty or Admin can insert weekly reports" ON public.faculty_reports FOR INSERT WITH CHECK (
    auth.uid() = faculty_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Faculty or Admin can update weekly reports" ON public.faculty_reports FOR UPDATE USING (
    auth.uid() = faculty_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admin can delete weekly reports" ON public.faculty_reports FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 5. Unique index to prevent double bookings (First-Come, First-Served)
CREATE UNIQUE INDEX IF NOT EXISTS unique_approved_appointment ON public.appointments (faculty_id, appointment_date, start_time) WHERE (status = 'approved');

-- Create views or functions if necessary
-- Function to handle new user registration triggers
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, department, id_number, address, age, is_approved, school_year, section)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'User'), 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'role', 'student'),
    new.raw_user_meta_data->>'department',
    new.raw_user_meta_data->>'id_number',
    new.raw_user_meta_data->>'address',
    CASE 
      WHEN new.raw_user_meta_data->>'age' ~ '^[0-9]+$' THEN (new.raw_user_meta_data->>'age')::integer
      ELSE NULL
    END,
    CASE 
      WHEN COALESCE(new.raw_user_meta_data->>'role', 'student') = 'faculty' THEN false 
      ELSE true 
    END,
    new.raw_user_meta_data->>'school_year',
    new.raw_user_meta_data->>'section'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
