const fs = require('fs');

const fileToBase64 = (file) => {
  if (!file) return null;
  try {
    const fileBuffer = fs.readFileSync(file.path);
    const base64Data = fileBuffer.toString('base64');
    const base64String = `data:${file.mimetype};base64,${base64Data}`;
    
    // Delete temporary file from local storage
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    
    return base64String;
  } catch (error) {
    console.error('Error converting file to base64:', error);
    // Attempt cleanup if file exists
    if (file.path && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch (e) {}
    }
    return null;
  }
};

module.exports = fileToBase64;
