/**
 * 安全工具模块 (重定向)
 * 此模块已被移动到 ../config/security.js
 * @deprecated 请使用 require('../config/security') 代替
 */

// 输出废弃警告
console.warn('警告: utils/security-utils.js 已废弃，请使用 config/security.js 代替');

// 重定向到新的安全模块
module.exports = require('../config/security'); 