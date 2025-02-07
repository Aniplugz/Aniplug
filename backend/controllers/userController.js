export const getUserProfile = async (req, res) => {
    try {
      const user = req.user; // Assuming user is attached to request by authMiddleware
      res.status(200).json({ status: 'success', data: user });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  
  export const updateUserProfile = async (req, res) => {
    try {
      const { name, email } = req.body;
      const user = req.user;
  
      // Update user logic here
      user.name = name || user.name;
      user.email = email || user.email;
      await user.save();
  
      res.status(200).json({ status: 'success', data: user });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  
  export const deleteUserAccount = async (req, res) => {
    try {
      const user = req.user;
      await user.remove(); // Delete user from database
      res.status(200).json({ status: 'success', message: 'Account deleted' });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };