const fs = require('fs');

const fileToBase64 = (file) => {
  if (!file) return null;
  try {
    // Support both memory storage (file.buffer) and disk storage (file.path)
    let fileBuffer;
    if (file.buffer) {
      fileBuffer = file.buffer;
    } else if (file.path) {
      fileBuffer = fs.readFileSync(file.path);
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } else {
      return null;
    }
    const base64Data = fileBuffer.toString('base64');
    return `data:${file.mimetype};base64,${base64Data}`;
  } catch (error) {
    console.error('Error converting file to base64:', error);
    // Attempt cleanup if disk file exists
    if (file.path && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch (e) {}
    }
    return null;
  }
};

module.exports = fileToBase64;
