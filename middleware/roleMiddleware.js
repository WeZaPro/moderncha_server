module.exports = (...roles) => {
  return (req, res, next) => {
    console.log("🔑 user role :", req.user?.role);
    console.log("✅ allowed   :", roles);
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
};
