/**
 * 配置管理模块
 * 负责加载和合并配置
 */

const path = require('path');
const fs = require('fs');
const defaultConfig = require('./default');
const security = require('./security');

// 从security模块中提取配置部分，过滤掉函数
const securityConfig = {
  pathSecurity: security.pathSecurity,
  operationSecurity: security.operationSecurity
};

/**
 * 加载配置
 * @param {string} configPath 配置文件路径
 * @returns {Object} 合并后的配置
 */
function loadConfig(configPath) {
  let userConfig = {};
  
  // 尝试加载用户配置
  if (configPath && fs.existsSync(configPath)) {
    try {
      userConfig = require(configPath);
      console.log(`已加载用户配置: ${configPath}`);
    } catch (error) {
      console.error(`加载用户配置失败: ${error.message}`);
    }
  }
  
  // 合并配置，优先级: 用户配置 > 默认配置
  const config = {
    ...defaultConfig,
    ...userConfig,
    security: {
      ...securityConfig,
      ...(userConfig.security || {})
    }
  };
  
  return config;
}

// 加载默认配置
const config = loadConfig(process.env.CONFIG_PATH);

// 导出合并后的配置
module.exports = config; 