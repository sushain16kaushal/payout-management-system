import * as userService from '../services/user.service.js';

export async function getUser(req, res, next) {
  try {
    const user = await userService.getUserById(req.params.id);
    res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}