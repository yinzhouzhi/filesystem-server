/**
 * 流处理工具模块
 * 提供文件流处理相关的工具函数
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { promisify } = require('util');
const { Readable } = require('stream');
const logger = require('./logging');
const pathUtils = require('./path-utils');

/**
 * 流式读取文件内容
 * @param {string} filePath 文件路径
 * @param {Object} options 选项
 * @param {string} options.encoding 编码方式
 * @param {Function} options.onChunk 分块处理回调
 * @param {number} options.highWaterMark 缓冲区大小
 * @returns {Promise<void>}
 */
async function streamReadFile(filePath, options = {}) {
  const { 
    encoding = 'utf8',
    onChunk = null,
    highWaterMark = 64 * 1024 // 64KB
  } = options;
  
  try {
    // 验证路径
    const validPath = pathUtils.validatePath(filePath);
    
    // 创建读取流
    const readStream = fs.createReadStream(validPath, {
      encoding,
      highWaterMark
    });
    
    return new Promise((resolve, reject) => {
      readStream.on('data', (chunk) => {
        if (onChunk && typeof onChunk === 'function') {
          onChunk(chunk);
        }
      });
      
      readStream.on('end', () => {
        resolve();
      });
      
      readStream.on('error', (error) => {
        logger.error('流式读取文件错误', { path: filePath, error });
        reject(error);
      });
    });
  } catch (error) {
    logger.error('创建文件读取流失败', { path: filePath, error });
    throw error;
  }
}

/**
 * 流式写入文件内容
 * @param {string} filePath 文件路径
 * @param {string|Buffer|Readable} content 文件内容或可读流
 * @param {Object} options 选项
 * @param {string} options.encoding 编码方式
 * @param {boolean} options.append 是否追加模式
 * @returns {Promise<void>}
 */
async function streamWriteFile(filePath, content, options = {}) {
  const {
    encoding = 'utf8',
    append = false
  } = options;
  
  try {
    // 验证路径
    const validPath = pathUtils.validatePath(filePath);
    
    // 确保目录存在
    const dirPath = path.dirname(validPath);
    await pathUtils.ensureDir(dirPath);
    
    // 创建写入流
    const writeStream = fs.createWriteStream(validPath, {
      encoding,
      flags: append ? 'a' : 'w'
    });
    
    return new Promise((resolve, reject) => {
      // 设置错误处理
      writeStream.on('error', (error) => {
        logger.error('流式写入文件错误', { path: filePath, error });
        reject(error);
      });
      
      // 处理完成回调
      writeStream.on('finish', () => {
        resolve();
      });
      
      // 根据内容类型处理
      if (content instanceof Readable) {
        // 如果是可读流，直接管道连接
        content.pipe(writeStream);
        content.on('error', (error) => {
          logger.error('读取内容流错误', { error });
          writeStream.end();
          reject(error);
        });
      } else {
        // 如果是字符串或Buffer，直接写入并结束
        writeStream.end(content, encoding);
      }
    });
  } catch (error) {
    logger.error('创建文件写入流失败', { path: filePath, error });
    throw error;
  }
}

/**
 * 统计文件行数
 * @param {string} filePath 文件路径
 * @returns {Promise<number>} 文件行数
 */
async function countFileLines(filePath) {
  return new Promise((resolve, reject) => {
    let lineCount = 0;
    
    try {
      // 验证路径
      const validPath = pathUtils.validatePath(filePath);
      const readStream = fs.createReadStream(validPath);
      
      const rl = readline.createInterface({
        input: readStream,
        crlfDelay: Infinity
      });
      
      rl.on('line', () => {
        lineCount++;
      });
      
      rl.on('close', () => {
        resolve(lineCount);
      });
      
      rl.on('error', (error) => {
        logger.error(`统计文件行数出错: ${error.message}`, { filePath, error });
        reject(error);
      });
      
      readStream.on('error', (error) => {
        logger.error(`读取文件流出错: ${error.message}`, { filePath, error });
        reject(error);
      });
    } catch (error) {
      logger.error(`创建文件流出错: ${error.message}`, { filePath, error });
      reject(error);
    }
  });
}

/**
 * 读取文件指定行范围
 * @param {string} filePath 文件路径
 * @param {number} start 起始行(从1开始)
 * @param {number} end 结束行
 * @param {string} encoding 编码方式
 * @returns {Promise<Array<string>>} 读取的行内容
 */
async function readFileLines(filePath, start, end, encoding = 'utf8') {
  return new Promise((resolve, reject) => {
    const lines = [];
    let currentLine = 0;
    
    try {
      // 验证路径
      const validPath = pathUtils.validatePath(filePath);
      const readStream = fs.createReadStream(validPath, { encoding });
      
      const rl = readline.createInterface({
        input: readStream,
        crlfDelay: Infinity
      });
      
      rl.on('line', (line) => {
        currentLine++;
        
        // 当读取到指定范围的行时，保存内容
        if (currentLine >= start && currentLine <= end) {
          lines.push(line);
        }
        
        // 如果已经读取到结束行，关闭流
        if (currentLine >= end) {
          rl.close();
          readStream.destroy();
        }
      });
      
      rl.on('close', () => {
        resolve(lines);
      });
      
      rl.on('error', (error) => {
        logger.error(`读取文件行出错: ${error.message}`, { filePath, start, end, error });
        reject(error);
      });
      
      readStream.on('error', (error) => {
        logger.error(`读取文件流出错: ${error.message}`, { filePath, error });
        reject(error);
      });
    } catch (error) {
      logger.error(`创建文件流出错: ${error.message}`, { filePath, error });
      reject(error);
    }
  });
}

/**
 * 按块读取文件内容
 * @param {string} filePath 文件路径
 * @param {number} chunkSize 块大小(字节)
 * @param {function} callback 处理每个块的回调函数(chunk, bytesRead, totalBytesRead)
 * @returns {Promise<number>} 总读取字节数
 */
async function readFileByChunks(filePath, chunkSize, callback) {
  return new Promise((resolve, reject) => {
    try {
      // 验证路径
      const validPath = pathUtils.validatePath(filePath);
      const stats = fs.statSync(validPath);
      const fileSize = stats.size;
      const fd = fs.openSync(validPath, 'r');
      
      const buffer = Buffer.alloc(chunkSize);
      let bytesRead = 0;
      let totalBytesRead = 0;
      let position = 0;
      
      const readNextChunk = () => {
        bytesRead = fs.readSync(fd, buffer, 0, chunkSize, position);
        
        if (bytesRead > 0) {
          totalBytesRead += bytesRead;
          position += bytesRead;
          
          // 调用回调处理当前块
          callback(buffer.slice(0, bytesRead), bytesRead, totalBytesRead);
          
          // 继续读取下一块
          if (position < fileSize) {
            readNextChunk();
          } else {
            fs.closeSync(fd);
            resolve(totalBytesRead);
          }
        } else {
          fs.closeSync(fd);
          resolve(totalBytesRead);
        }
      };
      
      readNextChunk();
    } catch (error) {
      logger.error(`按块读取文件出错: ${error.message}`, { filePath, chunkSize, error });
      reject(error);
    }
  });
}

/**
 * 写入流到文件
 * @param {stream.Readable} inputStream 输入流
 * @param {string} filePath 目标文件路径
 * @param {Object} options 选项
 * @param {boolean} options.append 是否追加模式，默认false
 * @returns {Promise<number>} 写入的字节数
 */
async function writeStreamToFile(inputStream, filePath, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      // 验证路径
      const validPath = pathUtils.validatePath(filePath);
      const { append = false } = options;
      const flags = append ? 'a' : 'w';
      
      // 创建写入流
      const writeStream = fs.createWriteStream(validPath, { flags });
      let bytesWritten = 0;
      
      // 监听写入数据事件
      writeStream.on('pipe', () => {
        logger.debug(`开始向文件写入流数据`, { filePath, append });
      });
      
      // 监听数据写入事件
      inputStream.on('data', (chunk) => {
        bytesWritten += chunk.length;
      });
      
      // 监听写入结束事件
      writeStream.on('finish', () => {
        logger.debug(`流数据写入完成，共写入 ${bytesWritten} 字节`, { filePath });
        resolve(bytesWritten);
      });
      
      // 监听错误事件
      writeStream.on('error', (error) => {
        logger.error(`写入流到文件出错: ${error.message}`, { filePath, error });
        reject(error);
      });
      
      inputStream.on('error', (error) => {
        logger.error(`读取输入流出错: ${error.message}`, { error });
        writeStream.end();
        reject(error);
      });
      
      // 将输入流导入到写入流
      inputStream.pipe(writeStream);
    } catch (error) {
      logger.error(`创建文件写入流出错: ${error.message}`, { filePath, error });
      reject(error);
    }
  });
}

module.exports = {
  streamReadFile,
  streamWriteFile,
  countFileLines,
  readFileLines,
  readFileByChunks,
  writeStreamToFile
}; 