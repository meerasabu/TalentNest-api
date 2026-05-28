const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const multer = require('multer');
const { verifyToken } = require('../middleware/authMiddleware');
const { sendRegistrationOtpEmail } = require('../utils/mailer');
const fileToBase64 = require('../utils/fileToBase64');

// Ensure registration_otps table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS registration_otps (
    email VARCHAR(255) PRIMARY KEY,
    otp VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    registration_data JSONB NOT NULL
  )
`).catch(err => console.error('Error creating registration_otps table:', err));

// Multer memory storage (Vercel-compatible, no disk writes)
const storage = multer.memoryStorage();
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const fileFilter = (req, file, cb) => {
  if (allowedImageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
  }
};
const upload = multer({ storage: storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// Signup Route
// Signup Route - Generates and sends OTP, stores temp registration data
router.post('/signup', async (req, res) => {
  const { firstName, lastName, campusEmail, department, graduationYear, password } = req.body;

  try {
    // Basic validation
    if (!firstName || !campusEmail || !password) {
      return res.status(400).json({ success: false, message: 'Required fields are missing.' });
    }

    // Check if user already exists in users table
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [campusEmail]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'User already exists with this email.' });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Hash the password for security before storing in temp table
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const registrationData = {
      firstName,
      lastName,
      department,
      graduationYear,
      passwordHash
    };

    // Upsert into registration_otps table
    await pool.query(
      `INSERT INTO registration_otps (email, otp, expires_at, registration_data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
       SET otp = EXCLUDED.otp, expires_at = EXCLUDED.expires_at, registration_data = EXCLUDED.registration_data`,
      [campusEmail, otp, expiresAt, JSON.stringify(registrationData)]
    );

    // Send OTP via SMTP
    await sendRegistrationOtpEmail(campusEmail, otp);

    res.status(200).json({
      success: true,
      message: 'A 6-digit verification code has been sent to your email.'
    });
  } catch (error) {
    console.error('Signup OTP generation error:', error);
    res.status(500).json({ success: false, message: 'Failed to process signup request.' });
  }
});

// Verify OTP & Create User Route
router.post('/signup/verify-otp', async (req, res) => {
  const { campusEmail, otp } = req.body;

  try {
    // Retrieve OTP from DB and check expiration
    const result = await pool.query(
      'SELECT * FROM registration_otps WHERE email = $1 AND otp = $2 AND expires_at > NOW()',
      [campusEmail, otp]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });
    }

    const { firstName, lastName, department, graduationYear, passwordHash } = result.rows[0].registration_data;

    // Insert new user into database
    const year = graduationYear ? parseInt(graduationYear, 10) : null;
    const newUser = await pool.query(
      `INSERT INTO users (first_name, last_name, email, department, graduation_year, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, first_name, last_name, email, department, graduation_year, role`,
      [firstName, lastName, campusEmail, department, year, passwordHash]
    );

    // Clear temp registration record
    await pool.query('DELETE FROM registration_otps WHERE email = $1', [campusEmail]);

    res.status(201).json({
      success: true,
      user: newUser.rows[0],
      message: 'Email verified and account created successfully!'
    });
  } catch (error) {
    console.error('Signup verification error:', error);
    res.status(500).json({ success: false, message: 'Server error during verification.' });
  }
});

// Resend Verification OTP Route
router.post('/signup/resend-otp', async (req, res) => {
  const { campusEmail } = req.body;

  try {
    // Check if temp record exists
    const recordResult = await pool.query('SELECT * FROM registration_otps WHERE email = $1', [campusEmail]);
    if (recordResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No active registration attempt found. Please fill the signup form again.' });
    }

    // Generate new OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update in database
    await pool.query(
      'UPDATE registration_otps SET otp = $1, expires_at = $2 WHERE email = $3',
      [otp, expiresAt, campusEmail]
    );

    // Resend email
    await sendRegistrationOtpEmail(campusEmail, otp);

    res.status(200).json({
      success: true,
      message: 'A new 6-digit verification code has been sent to your email.'
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to resend verification code.' });
  }
});

// Login Route
router.post('/login', async (req, res) => {
  // Accept both 'email' and 'campusEmail' for compatibility
  const { email, campusEmail, password } = req.body;
  const userEmail = email || campusEmail;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [userEmail]);
    if (userResult.rows.length === 0) {
      console.log('Login failed: no user found for email:', userEmail);
      return res.status(400).json({ success: false, message: 'Invalid credentials.' });
    }

    const user = userResult.rows[0];

    console.log('Login attempt for:', userEmail, '| hash exists:', !!user.password_hash, '| hash length:', user.password_hash?.length);
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.log('Login failed: password mismatch for:', userEmail);
      return res.status(400).json({ success: false, message: 'Invalid credentials.' });
    }

    // Record login timestamp
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({ 
      success: true, 
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        department: user.department,
        graduationYear: user.graduation_year,
        bio: user.bio,
        phoneNumber: user.phone_number,
        campusLocation: user.campus_location,
        skills: user.skills || [],
        profileImage: user.profile_image,
        bannerImage: user.banner_image,
        role: user.role
      },
      message: 'Login successful.' 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// Get User Profile Details with Review Stats
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }

    const userRes = await pool.query(
      `SELECT id, first_name as "firstName", last_name as "lastName", email, department, 
              graduation_year as "graduationYear", bio, phone_number as "phoneNumber", 
              campus_location as "campusLocation", profile_image as "profileImage", 
              banner_image as "bannerImage", role, created_at as "createdAt"
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const user = userRes.rows[0];

    // Get review stats
    const statsRes = await pool.query(
      `SELECT COALESCE(AVG(rating), 0) as avg_rating, COUNT(*) as review_count 
       FROM reviews WHERE reviewed_id = $1`,
      [userId]
    );

    const stats = statsRes.rows[0];
    user.rating = parseFloat(parseFloat(stats.avg_rating).toFixed(1));
    user.reviewCount = parseInt(stats.review_count, 10);

    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ success: false, message: 'Server error fetching user profile.' });
  }
});

// Get User Activity Timeline
router.get('/users/:id/activity', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }

    const activities = [];

    // 1. Get user join date, bio status, and last login
    const userRes = await pool.query('SELECT created_at, profile_updated_at, bio, last_login_at FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const userRow = userRes.rows[0];
    
    // Add "Logged in" activity using last_login_at if available, else created_at
    const loginTime = userRow.last_login_at || userRow.created_at || new Date();
    activities.push({
      activity_type: 'login',
      details: 'Logged in',
      item_type: 'system',
      created_at: loginTime
    });

    // Add "Updated profile bio" if bio exists and profile_updated_at is set
    if (userRow.bio && userRow.profile_updated_at) {
      activities.push({
        activity_type: 'profile_update',
        details: 'Updated profile bio',
        item_type: 'profile',
        created_at: userRow.profile_updated_at
      });
    }

    // 2. Get listings created
    const prodRes = await pool.query('SELECT title, created_at FROM products WHERE user_id = $1', [userId]);
    prodRes.rows.forEach(row => {
      activities.push({
        activity_type: 'listing_create',
        details: `Listed a new product: ${row.title}`,
        item_type: 'product',
        created_at: row.created_at
      });
    });

    const skillRes = await pool.query('SELECT title, created_at FROM skills WHERE user_id = $1', [userId]);
    skillRes.rows.forEach(row => {
      activities.push({
        activity_type: 'listing_create',
        details: `Listed a new skill: ${row.title}`,
        item_type: 'skill',
        created_at: row.created_at
      });
    });

    const servRes = await pool.query('SELECT title, created_at FROM services WHERE user_id = $1', [userId]);
    servRes.rows.forEach(row => {
      activities.push({
        activity_type: 'listing_create',
        details: `Listed a new service: ${row.title}`,
        item_type: 'service',
        created_at: row.created_at
      });
    });

    // 3. Get reviews written by this user
    const reviewRes = await pool.query(
      `SELECT r.created_at, u.first_name, u.last_name 
       FROM reviews r 
       JOIN users u ON r.reviewed_id = u.id 
       WHERE r.reviewer_id = $1`,
      [userId]
    );
    reviewRes.rows.forEach(row => {
      activities.push({
        activity_type: 'review_written',
        details: `You reviewed a service/product of ${row.first_name} ${row.last_name}`,
        item_type: 'review',
        created_at: row.created_at
      });
    });

    // 4. Get completed orders and requested orders
    const orderRes = await pool.query(
      `SELECT o.created_at, o.updated_at, o.item_type, o.status, o.buyer_id, o.seller_id,
              COALESCE(p.title, s.title, srv.title) as title
       FROM orders o 
       LEFT JOIN products p ON o.item_id = p.id AND o.item_type = 'product' 
       LEFT JOIN skills s ON o.item_id = s.id AND o.item_type = 'skill' 
       LEFT JOIN services srv ON o.item_id = srv.id AND o.item_type = 'service' 
       WHERE (o.buyer_id = $1 OR o.seller_id = $1)`,
      [userId]
    );

    orderRes.rows.forEach(row => {
      if (row.status === 'Completed' && row.updated_at) {
        activities.push({
          activity_type: 'order_complete',
          details: `Completed ${row.item_type}: ${row.title || 'Item'}`,
          item_type: row.item_type,
          created_at: row.updated_at
        });
      }
      if (row.buyer_id === userId) {
        activities.push({
          activity_type: 'order_place',
          details: `Ordered ${row.item_type}: ${row.title || 'Item'}`,
          item_type: row.item_type,
          created_at: row.created_at
        });
      }
    });

    // Sort by created_at DESC
    activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Limit to top 15
    res.status(200).json({ success: true, activities: activities.slice(0, 15) });
  } catch (error) {
    console.error('Error fetching user activities:', error);
    res.status(500).json({ success: false, message: 'Server error fetching user activities.' });
  }
});

// Update Profile Route
router.put('/profile/:id', verifyToken, upload.fields([{ name: 'profileImage', maxCount: 1 }, { name: 'bannerImage', maxCount: 1 }]), async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, bio, department, graduationYear, phoneNumber, campusLocation, skills } = req.body;
  
  // Parse ID
  const userId = parseInt(id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ success: false, message: 'Invalid user ID format.' });
  }

  // Authorization: users can only edit their own profile
  if (req.user.id !== userId) {
    return res.status(403).json({ success: false, message: 'You can only edit your own profile.' });
  }

  console.log('--- Profile Update Request ---');
  console.log('User ID:', userId);
  console.log('Body Keys:', Object.keys(req.body));

  try {
    // Basic Validation
    if (!firstName) {
      return res.status(400).json({ success: false, message: 'First name is required.' });
    }

    // Determine image URLs
    let profileImageUrl = req.body.profileImageUrl || null;
    let bannerImageUrl = req.body.bannerImageUrl || null;

    if (req.files && req.files['profileImage']) {
      profileImageUrl = fileToBase64(req.files['profileImage'][0]);
    }
    if (req.files && req.files['bannerImage']) {
      bannerImageUrl = fileToBase64(req.files['bannerImage'][0]);
    }

    // Sanitize graduationYear
    const gradYearInt = (graduationYear && graduationYear !== "null" && graduationYear !== "" && graduationYear !== "undefined") ? parseInt(graduationYear, 10) : null;

    // Parse skills
    let skillsArray = [];
    if (skills && skills !== "undefined" && skills !== "null") {
      try {
        skillsArray = typeof skills === 'string' ? JSON.parse(skills) : skills;
      } catch (e) {
        console.error('Error parsing skills JSON:', e);
        skillsArray = [];
      }
    }

    const result = await pool.query(
      `UPDATE users 
       SET first_name = $1, last_name = $2, bio = $3, department = $4, graduation_year = $5, 
           phone_number = $6, campus_location = $7, skills = $8, profile_image = $9, banner_image = $10,
           profile_updated_at = CURRENT_TIMESTAMP
       WHERE id = $11
       RETURNING id, first_name, last_name, email, department, graduation_year, bio, phone_number, campus_location, skills, profile_image, banner_image, role, profile_updated_at`,
      [firstName, lastName || '', bio || '', department || '', gradYearInt, phoneNumber || '', campusLocation || '', JSON.stringify(skillsArray), profileImageUrl, bannerImageUrl, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const row = result.rows[0];
    const updatedUser = {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      department: row.department,
      graduationYear: row.graduation_year,
      bio: row.bio,
      phoneNumber: row.phone_number,
      campusLocation: row.campus_location,
      skills: row.skills || [],
      profileImage: row.profile_image,
      bannerImage: row.banner_image,
      role: row.role
    };

    console.log('Profile updated successfully for user:', userId);
    res.status(200).json({ success: true, user: updatedUser, message: 'Profile updated successfully.' });
  } catch (error) {
    console.error('CRITICAL Profile update error:', error);
    res.status(500).json({ success: false, message: 'Database error during profile update.' });
  }
});

// Forgot Password - Send OTP
const { sendOtpEmail } = require('../utils/mailer');
router.post('/forgot-password', async (req, res) => {
  const { campusEmail } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [campusEmail]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No registered account found with this email.' });
    }

    // Generate secure 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // Save OTP to DB
    await pool.query(
      'UPDATE users SET reset_otp = $1, reset_otp_expires_at = $2 WHERE email = $3',
      [otp, expiresAt, campusEmail]
    );

    // Send OTP via SMTP
    try {
      await sendOtpEmail(campusEmail, otp);
      
      res.status(200).json({
        success: true,
        message: 'Secure 6-digit OTP has been sent to your email address.'
      });
    } catch (mailErr) {
      console.error('SMTP Email dispatch failed:', mailErr.message);
      
      // We could optionally revert the OTP in DB here, but it will expire anyway.
      // Send a clear 500 error to the client indicating the email failed to send.
      res.status(500).json({ 
        success: false, 
        message: 'Failed to send OTP email due to server configuration. Please contact support or check your SMTP settings.' 
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Failed to process forgot password request.' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  const { campusEmail, otp } = req.body;

  try {
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND reset_otp = $2 AND reset_otp_expires_at > NOW()',
      [campusEmail, otp]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please request a new code.' });
    }

    // Generate brief reset authorization token
    const resetToken = jwt.sign(
      { email: campusEmail, resetAuthorized: true },
      process.env.JWT_SECRET,
      { expiresIn: '10m' } // 10 minutes limit to complete password change
    );

    // Optional: Clear OTP immediately upon verification
    await pool.query('UPDATE users SET reset_otp = NULL, reset_otp_expires_at = NULL WHERE email = $1', [campusEmail]);

    res.status(200).json({
      success: true,
      resetToken,
      message: 'OTP verified successfully. Please create a new password.'
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify OTP.' });
  }
});

// Secure Password Reset
router.post('/reset-password', async (req, res) => {
  const { campusEmail, resetToken, newPassword } = req.body;

  try {
    // Verify the temporary authorization token
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Invalid or expired reset session. Please try again.' });
    }

    if (decoded.email !== campusEmail || !decoded.resetAuthorized) {
      return res.status(403).json({ success: false, message: 'Unauthorized reset request.' });
    }

    // Hash the new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    const updateResult = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id',
      [passwordHash, campusEmail]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Your password has been reset successfully! Redirecting to Sign In...'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
});

// Change Password Route
router.post('/change-password', verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect current password.' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);

    res.status(200).json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Failed to update password.' });
  }
});

module.exports = router;
