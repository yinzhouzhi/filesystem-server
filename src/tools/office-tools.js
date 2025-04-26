/**
 * Office文件操作工具模块
 * 实现Word和Excel文件的内容读取
 */
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const ExcelJS = require('exceljs');
const logger = require('../utils/logging');
const pathUtils = require('../utils/path-utils');
const securityUtils = require('../config/security');
const config = require('../config');

/**
 * 读取Word文档内容并转换为文本
 * @param {Object} params 参数
 * @param {string} params.path Word文件路径
 * @param {boolean} params.extractImages 是否提取图片信息，默认false
 * @param {boolean} params.includeStyles 是否包含样式信息，默认false
 * @param {string} params.outputFormat 输出格式，支持'text'和'html'，默认'text'
 * @param {Object} params.pagination 分页参数，{ pageSize: 每页字符数, pageNum: 页码(从1开始) }
 * @param {Object} params.range 读取范围，{ startLine: 起始行, endLine: 结束行 }
 * @param {boolean} params.splitByParagraphs 是否按段落拆分，默认false
 * @returns {Promise<Object>} 文档内容结果
 */
async function readWordDocument(params) {
  const { 
    path: filePath, 
    extractImages = false, 
    includeStyles = false,
    outputFormat = 'text',
    pagination,
    range,
    splitByParagraphs = false
  } = params;
  
  // 检查权限
  if (!securityUtils.validateToolCall('read_word_document', params)) {
    throw new Error('没有权限读取Word文档');
  }
  
  try {
    // 验证路径
    const validPath = pathUtils.validatePath(filePath);
    
    // 检查文件是否存在
    const exists = await pathUtils.pathExists(validPath);
    if (!exists) {
      throw new Error(`文件不存在: ${validPath}`);
    }
    
    // 获取文件信息
    const stats = await fs.promises.stat(validPath);
    
    // 检查是否是文件
    if (!stats.isFile()) {
      throw new Error(`路径不是文件: ${validPath}`);
    }
    
    // 检查文件类型
    const ext = path.extname(validPath).toLowerCase();
    if (ext !== '.docx' && ext !== '.doc') {
      throw new Error(`不支持的文件类型: ${ext}，仅支持.doc和.docx格式`);
    }
    
    // 检查文件大小
    if (stats.size > config.security.operationSecurity.maxReadSize) {
      throw new Error(`文件大小(${stats.size}字节)超过允许的最大值(${config.security.operationSecurity.maxReadSize}字节)`);
    }
    
    // 读取Word文档内容
    logger.info(`读取Word文档: ${validPath}，格式: ${outputFormat}`);
    
    // 选择输出格式
    let result;
    const options = { 
      path: validPath,
      transformDocument: includeStyles ? undefined : mammoth.transforms.removeEmptyParagraphs
    };
    
    // 根据不同输出格式处理
    if (outputFormat === 'html') {
      result = await mammoth.convertToHtml(options);
    } else {
      result = await mammoth.extractRawText(options);
    }
    
    // 处理文档内容
    let content = result.value;
    let paragraphs = [];
    let lines = [];
    let paginatedContent = null;
    let rangedContent = null;
    
    // 按段落拆分
    if (splitByParagraphs || range || pagination) {
      if (outputFormat === 'html') {
        // 从HTML中提取段落
        paragraphs = content.split(/<\/?p[^>]*>/g)
          .filter(p => p.trim().length > 0);
      } else {
        // 从纯文本中提取段落
        paragraphs = content.split(/\n\s*\n/)
          .filter(p => p.trim().length > 0);
      }
      
      // 按行拆分（每个段落可能包含多行）
      lines = content.split(/\n/)
        .filter(line => line.trim().length > 0);
    }
    
    // 处理行范围读取
    if (range) {
      const startLine = Math.max(1, range.startLine || 1);
      const endLine = Math.min(lines.length, range.endLine || lines.length);
      
      if (startLine > endLine || startLine > lines.length) {
        throw new Error(`无效的行范围: 起始行${startLine}, 结束行${endLine}, 总行数${lines.length}`);
      }
      
      rangedContent = lines.slice(startLine - 1, endLine).join('\n');
    }
    
    // 处理分页
    if (pagination) {
      const pageSize = Math.max(100, pagination.pageSize || 1000); // 最小页大小100字符
      const pageNum = Math.max(1, pagination.pageNum || 1);
      
      const totalPages = Math.ceil(content.length / pageSize);
      
      if (pageNum > totalPages) {
        throw new Error(`无效的页码: ${pageNum}, 总页数: ${totalPages}`);
      }
      
      const startPos = (pageNum - 1) * pageSize;
      const endPos = Math.min(content.length, startPos + pageSize);
      
      paginatedContent = content.substring(startPos, endPos);
    }
    
    // 处理图片提取
    let images = [];
    if (extractImages) {
      try {
        const imgResults = await mammoth.images.extractAll({ path: validPath });
        images = await Promise.all(imgResults.map(async (img, index) => {
          const imgExt = img.contentType.split('/')[1] || 'png';
          const imgName = `image_${index + 1}.${imgExt}`;
          const imgDataBase64 = img.buffer.toString('base64');
          
          return {
            name: imgName,
            contentType: img.contentType,
            size: img.buffer.length,
            dataPreview: imgDataBase64.substring(0, 100) + '...',
            altText: img.altText || ''
          };
        }));
      } catch (imgError) {
        logger.warn(`提取文档图片失败: ${imgError.message}`, { path: validPath });
      }
    }
    
    // 提取文档元数据
    let metadata = {};
    try {
      // 获取简单元数据
      metadata = {
        fileName: path.basename(validPath),
        fileSize: stats.size,
        fileType: ext,
        lastModified: stats.mtime,
        pageCount: paragraphs.length > 0 ? Math.ceil(paragraphs.length / 3) : undefined, // 粗略估计页数
        paragraphCount: paragraphs.length,
        lineCount: lines.length,
        charCount: content.length
      };
    } catch (metaError) {
      logger.warn(`提取文档元数据失败: ${metaError.message}`);
    }
    
    // 构建返回结果
    return {
      success: true,
      path: validPath,
      content: rangedContent || paginatedContent || content,
      format: outputFormat,
      metadata,
      images: extractImages ? images : undefined,
      messages: result.messages,
      // 分页信息
      pagination: pagination ? {
        pageSize: pagination.pageSize,
        pageNum: pagination.pageNum,
        totalPages: Math.ceil(content.length / (pagination.pageSize || 1000)),
        totalChars: content.length
      } : undefined,
      // 范围信息
      range: range ? {
        startLine: range.startLine,
        endLine: Math.min(lines.length, range.endLine || lines.length),
        totalLines: lines.length
      } : undefined,
      // 段落信息
      paragraphs: splitByParagraphs ? paragraphs : undefined
    };
  } catch (error) {
    logger.error(`读取Word文档失败: ${error.message}`, { path: filePath, error });
    throw error;
  }
}

/**
 * 读取Excel文件内容
 * @param {Object} params 参数
 * @param {string} params.path Excel文件路径
 * @param {string|number} params.sheet 工作表名称或索引，默认读取第一个工作表
 * @param {string} params.outputFormat 输出格式，支持'json'、'csv'、'array'，默认'array'
 * @param {Object} params.range 读取范围，格式为{startRow, endRow, startCol, endCol}
 * @param {boolean} params.includeFormulas 是否包含公式，默认false
 * @param {boolean} params.headerRow 是否将第一行作为表头，默认false
 * @returns {Promise<Object>} Excel内容结果
 */
async function readExcelFile(params) {
  const { 
    path: filePath, 
    sheet,
    outputFormat = 'array',
    range,
    includeFormulas = false,
    headerRow = false
  } = params;
  
  // 检查权限
  if (!securityUtils.validateToolCall('read_excel_file', params)) {
    throw new Error('没有权限读取Excel文件');
  }
  
  try {
    // 验证路径
    const validPath = pathUtils.validatePath(filePath);
    
    // 检查文件是否存在
    const exists = await pathUtils.pathExists(validPath);
    if (!exists) {
      throw new Error(`文件不存在: ${validPath}`);
    }
    
    // 获取文件信息
    const stats = await fs.promises.stat(validPath);
    
    // 检查是否是文件
    if (!stats.isFile()) {
      throw new Error(`路径不是文件: ${validPath}`);
    }
    
    // 检查文件类型
    const ext = path.extname(validPath).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls' && ext !== '.csv') {
      throw new Error(`不支持的文件类型: ${ext}，仅支持.xlsx、.xls和.csv格式`);
    }
    
    // 检查文件大小
    if (stats.size > config.security.operationSecurity.maxReadSize) {
      throw new Error(`文件大小(${stats.size}字节)超过允许的最大值(${config.security.operationSecurity.maxReadSize}字节)`);
    }
    
    // 读取Excel文件内容
    logger.info(`读取Excel文件: ${validPath}, 格式: ${outputFormat}`);
    const workbook = new ExcelJS.Workbook();
    
    // 根据文件类型选择不同的读取方法
    if (ext === '.csv') {
      await workbook.csv.readFile(validPath);
    } else {
      await workbook.xlsx.readFile(validPath);
    }
    
    // 获取所有工作表名称
    const sheetNames = workbook.worksheets.map(ws => ws.name);
    
    // 如果指定了工作表，则读取指定工作表
    let targetSheet;
    if (sheet !== undefined) {
      if (typeof sheet === 'number') {
        // 通过索引获取工作表
        if (sheet >= 0 && sheet < workbook.worksheets.length) {
          targetSheet = workbook.worksheets[sheet];
        } else {
          throw new Error(`工作表索引超出范围: ${sheet}，有效范围: 0-${workbook.worksheets.length - 1}`);
        }
      } else {
        // 通过名称获取工作表
        targetSheet = workbook.getWorksheet(sheet);
        if (!targetSheet) {
          throw new Error(`找不到工作表: ${sheet}`);
        }
      }
    } else {
      // 默认使用第一个工作表
      targetSheet = workbook.worksheets[0];
    }
    
    if (!targetSheet) {
      throw new Error('Excel文件中没有有效的工作表');
    }
    
    // 获取工作表数据
    const sheetData = {
      name: targetSheet.name,
      index: workbook.worksheets.indexOf(targetSheet),
      rowCount: targetSheet.rowCount,
      columnCount: targetSheet.columnCount,
      properties: targetSheet.properties,
      dimensions: targetSheet.dimensions
    };
    
    // 确定读取范围
    let startRow = 1;
    let endRow = targetSheet.rowCount || 1000; // 如果获取不到行数，默认限制在1000行
    let startCol = 1;
    let endCol = targetSheet.columnCount || 26; // 如果获取不到列数，默认限制为26列(A-Z)
    
    if (range) {
      startRow = range.startRow || startRow;
      endRow = Math.min(range.endRow || endRow, endRow);
      startCol = range.startCol || startCol;
      endCol = Math.min(range.endCol || endCol, endCol);
    }
    
    // 限制范围以防止过大的数据集
    if (endRow - startRow > 5000) {
      endRow = startRow + 5000;
      logger.warn(`行范围过大，已限制为最多5000行`);
    }
    
    if (endCol - startCol > 100) {
      endCol = startCol + 100;
      logger.warn(`列范围过大，已限制为最多100列`);
    }
    
    // 读取数据
    let data = [];
    let headers = [];
    
    // 处理表头
    if (headerRow && startRow <= endRow) {
      const headerRowData = [];
      const headerRowObj = targetSheet.getRow(startRow);
      
      for (let col = startCol; col <= endCol; col++) {
        const cell = headerRowObj.getCell(col);
        const value = cell ? cell.value : null;
        headerRowData.push(value);
      }
      
      headers = headerRowData;
      startRow++; // 表头行已处理，从下一行开始读取数据
    }
    
    // 读取表格数据
    for (let row = startRow; row <= endRow; row++) {
      const rowObj = targetSheet.getRow(row);
      if (!rowObj.hasValues) continue; // 跳过空行
      
      if (outputFormat === 'json' && headerRow) {
        // JSON格式，使用表头作为键
        const rowData = {};
        for (let col = startCol; col <= endCol; col++) {
          const cell = rowObj.getCell(col);
          const header = headers[col - startCol];
          
          if (header) {
            rowData[header] = includeFormulas && cell.formula 
              ? { value: cell.value, formula: cell.formula } 
              : cell.value;
          }
        }
        data.push(rowData);
      } else {
        // array或csv格式
        const rowData = [];
        for (let col = startCol; col <= endCol; col++) {
          const cell = rowObj.getCell(col);
          rowData.push(includeFormulas && cell.formula 
            ? { value: cell.value, formula: cell.formula } 
            : cell.value);
        }
        data.push(rowData);
      }
    }
    
    // 处理不同的输出格式
    let formattedData = data;
    if (outputFormat === 'csv') {
      // 转换为CSV格式
      formattedData = data.map(row => 
        row.map(cell => {
          if (cell === null || cell === undefined) return '';
          if (typeof cell === 'object') return JSON.stringify(cell);
          return String(cell);
        }).join(',')
      ).join('\n');
      
      // 如果有表头，添加到CSV的开头
      if (headerRow && headers.length > 0) {
        formattedData = headers.join(',') + '\n' + formattedData;
      }
    }
    
    // 获取文件元数据
    const metadata = {
      fileName: path.basename(validPath),
      fileSize: stats.size,
      fileType: ext,
      lastModified: stats.mtime,
      sheetCount: workbook.worksheets.length,
      creator: workbook.creator || '',
      lastModifiedBy: workbook.lastModifiedBy || '',
      created: workbook.created || null,
      modified: workbook.modified || null
    };
    
    return {
      success: true,
      path: validPath,
      format: outputFormat,
      sheet: sheetData,
      headers: headerRow ? headers : undefined,
      data: formattedData,
      range: {
        startRow,
        endRow,
        startCol,
        endCol,
        rowCount: endRow - startRow + 1,
        colCount: endCol - startCol + 1
      },
      metadata,
      availableSheets: sheetNames
    };
  } catch (error) {
    logger.error(`读取Excel文件失败: ${error.message}`, { path: filePath, error });
    throw error;
  }
}

module.exports = {
  readWordDocument,
  readExcelFile
}; 