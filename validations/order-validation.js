const Joi = require('joi');


exports.couponValidationSchema = Joi.object({
    coupon: Joi.string().required()
});
