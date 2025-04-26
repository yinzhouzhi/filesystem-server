/**
 * 文件行操作工具模块
 * 实现文件行的读取、计数等操作
 */
const fs = require('fs');
const logger = require('../utils/logging');
const pathUtils = require('../utils/path-utils');
const streamUtils = require('../utils/stream-utils');
const securityUtils = require('../config/security');
const config = require('../config');

/**
 * 读取文件指定行范围
 * @param {Object} params 参数
 * @param {string} params.path 文件路径
 * @param {number} params.start 起始行(从1开始)
 * @param {number} params.end 结束行
 * @param {string} params.encoding 编码方式，默认utf-8
 * @returns {Promise<Object>} 读取结果
 */
async function readFileLines(params) {
  const { 
    path: filePath, 
    start, 
    end, 
    encoding = 'utf8' 
  } = params;
  
  // 检查权限
  if (!securityUtils.validateToolCall('read_file_lines', params)) {
    throw new Error('没有权限读取文件行');
  }
  
  try {
    // 验证参数
    if (!filePath) {
      throw new Error('缺少文件路径参数');
    }
    
    if (typeof start !== 'number' || start <= 0) {
      throw new Error('起始行必须是大于0的整数');
    }
    
    if (typeof end !== 'number' || end < start) {
      throw new Error('结束行必须大于或等于起始行');
    }
    
    // 验证路径
    const validPath = pathUtils.validatePath(filePath);
    
    // 检查文件是否存在
    const exists = await pathUtils.pathExists(validPath);
    if (!exists) {
      throw new Error(`文件不存在: ${validPath}`);
    }
    
    // 检查是否是文件
    const stats = await fs.promises.stat(validPath);
    if (!stats.isFile()) {
      throw new Error(`路径不是文件: ${validPath}`);
    }
    
    // 检查文件大小
    if (stats.size > config.security.operationSecurity.maxReadSize) {
      throw new Error(`文件大小(${stats.size}字节)超过允许的最大值(${config.security.operationSecurity.maxReadSize}字节)`);
    }
    
    // 获取总行数
    const lineCount = await streamUtils.countFileLines(validPath);
    
    // 处理超出范围的情况
    if (start > lineCount) {
      logger.warn(`请求的起始行 ${start} 超出文件范围(共${lineCount}行)`, { path: validPath });
      return { 
        lines: [], 
        range: { start, end },
        totalLines: lineCount,
        message: `请求的起始行超出文件范围(共${lineCount}行)` 
      };
    }
    
    // 调整结束行为文件实际行数
    const actualEnd = Math.min(end, lineCount);
    
    logger.info(`读取文件行: ${validPath}, 范围: ${start}-${actualEnd}, 总行数: ${lineCount}`);
    
    // 读取指定范围的行
    const lines = await streamUtils.readFileLines(validPath, start, actualEnd, encoding);
    
    return {
      lines,
      range: { start, end: actualEnd },
      totalLines: lineCount
    };
  } catch (error) {
    logger.error(`读取文件行失败: ${error.message}`, { path: filePath, start, end, error });
    throw error;
  }
}

/**
 * 统计文件行数
 * @param {Object} params 参数
 * @param {string} params.path 文件路径
 * @returns {Promise<Object>} 统计结果
 */
async function countFileLines(params) {
  const { path: filePath } = params;
  
  // 检查权限
  if (!securityUtils.validateToolCall('count_lines', params)) {
    throw new Error('没有权限统计文件行数');
  }
  
  try {
    // 验证路径
    const validPath = pathUtils.validatePath(filePath);
    
    // 检查文件是否存在
    const exists = await pathUtils.pathExists(validPath);
    if (!exists) {
      throw new Error(`文件不存在: ${validPath}`);
    }
    
    // 检查是否是文件
    const stats = await fs.promises.stat(validPath);
    if (!stats.isFile()) {
      throw new Error(`路径不是文件: ${validPath}`);
    }
    
    // 检查文件大小
    if (stats.size > config.security.operationSecurity.maxReadSize) {
      throw new Error(`文件大小(${stats.size}字节)超过允许的最大值(${config.security.operationSecurity.maxReadSize}字节)`);
    }
    
    logger.info(`统计文件行数: ${validPath}`);
    
    // 统计行数
    const lineCount = await streamUtils.countFileLines(validPath);
    
    return { 
      path: validPath,
      lineCount,
      size: stats.size
    };
  } catch (error) {
    logger.error(`统计文件行数失败: ${error.message}`, { path: filePath, error });
    throw error;
  }
}

/**
 * 搜索文件内容
 * @param {Object} params 参数
 * @param {string} params.path 文件路径
 * @param {string} params.pattern 搜索模式
 * @param {boolean} params.regex 是否使用正则表达式，默认false
 * @param {boolean} params.ignoreCase 是否忽略大小写，默认false
 * @param {string} params.encoding 编码方式，默认utf-8
 * @returns {Promise<Object>} 搜索结果
 */
async function searchFileContent(params) {
  const { 
    path: filePath, 
    pattern, 
    regex = false, 
    ignoreCase = false, 
    encoding = 'utf8' 
  } = params;
  
  // 检查权限
  if (!securityUtils.validateToolCall('search_file', params)) {
    throw new Error('没有权限搜索文件内容');
  }
  
  try {
    // 验证参数
    if (!filePath) {
      throw new Error('缺少文件路径参数');
    }
    
    if (!pattern) {
      throw new Error('缺少搜索模式参数');
    }
    
    // 验证路径
    const validPath = pathUtils.validatePath(filePath);
    
    // 检查文件是否存在
    const exists = await pathUtils.pathExists(validPath);
    if (!exists) {
      throw new Error(`文件不存在: ${validPath}`);
    }
    
    // 检查是否是文件
    const stats = await fs.promises.stat(validPath);
    if (!stats.isFile()) {
      throw new Error(`路径不是文件: ${validPath}`);
    }
    
    // 检查文件大小
    if (stats.size > config.security.operationSecurity.maxReadSize) {
      throw new Error(`文件大小(${stats.size}字节)超过允许的最大值(${config.security.operationSecurity.maxReadSize}字节)`);
    }
    
    // 编译正则表达式
    let searchRegex;
    if (regex) {
      try {
        searchRegex = new RegExp(pattern, ignoreCase ? 'i' : '');
      } catch (error) {
        throw new Error(`无效的正则表达式: ${error.message}`);
      }
    } else {
      // 转义特殊字符，创建字面量匹配正则表达式
      const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      searchRegex = new RegExp(escapedPattern, ignoreCase ? 'i' : '');
    }
    
    logger.info(`搜索文件内容: ${validPath}, 模式: ${pattern}`);
    
    // 读取文件内容并搜索
    const matches = [];
    let lineNumber = 0;
    
    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(validPath, { encoding });
      const reader = require('readline').createInterface({
        input: readStream,
        crlfDelay: Infinity
      });
      
      reader.on('line', (line) => {
        lineNumber++;
        
        // 搜索当前行
        if (searchRegex.test(line)) {
          matches.push({
            line: lineNumber,
            content: line,
            index: line.search(searchRegex)
          });
        }
      });
      
      reader.on('close', () => {
        resolve();
      });
      
      reader.on('error', (error) => {
        reject(error);
      });
    });
    
    return {
      path: validPath,
      pattern: pattern,
      matches,
      matchCount: matches.length,
      totalLines: lineNumber
    };
  } catch (error) {
    logger.error(`搜索文件内容失败: ${error.message}`, { path: filePath, pattern, error });
    throw error;
  }
}

module.exports = {
  readFileLines,
  countFileLines,
  searchFileContent
}; 