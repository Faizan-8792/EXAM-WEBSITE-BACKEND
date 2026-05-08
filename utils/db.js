const Setting = require("../models/Setting");

let connectionPromise = null;
let dbStatus = "disconnected";
let dbError = "";

const connectDb = async () => {
  if (!connectionPromise) {
    dbStatus = "connecting";
    dbError = "";

    connectionPromise = Promise.resolve()
      .then(async () => {
        await Setting.getSingleton();
        dbStatus = "connected";
        return true;
      })
      .catch((error) => {
        connectionPromise = null;
        dbStatus = "disconnected";
        dbError = error.message || "Supabase connection failed";
        throw error;
      });
  }

  return connectionPromise;
};

const getDbStatus = () => ({
  status: dbStatus,
  error: dbError
});

const requireDbConnection = async (req, res, next) => {
  try {
    await connectDb();
    return next();
  } catch (error) {
    return res.status(503).json({
      message: "Database connection is currently unavailable. Please check Supabase configuration and table setup."
    });
  }
};

module.exports = {
  connectDb,
  getDbStatus,
  requireDbConnection
};
