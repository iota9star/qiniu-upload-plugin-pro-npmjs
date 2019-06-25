const qiniu = require('qiniu');
const path = require('path');
const ora = require('ora');

// 上传文件到七牛云
class QiniuUploadPluginPro {
  constructor(qnConfig) {
    if (!qnConfig || !qnConfig.publicPath || !qnConfig.accessKey || !qnConfig.secretKey || !qnConfig.bucket || !qnConfig.zone) {
      throw '缺失必要参数！';
    }
    // 保存用户传参
    this.config = qnConfig;
    if (!this.config.pathPrefixLimit || this.config.pathPrefixLimit <= 0) {
      this.config.pathPrefixLimit = 99999999;// 设置默认值
    }
    // 鉴权
    this.mac = new qiniu.auth.digest.Mac(qnConfig.accessKey, qnConfig.secretKey);
    // 设置存储空间名称
    const options = {scope: qnConfig.bucket};
    // 创建上传token
    const putPolicy = new qiniu.rs.PutPolicy(options);
    this.uploadToken = putPolicy.uploadToken(this.mac);
    let config = new qiniu.conf.Config();
    // 存储空间对应的机房
    config.zone = qiniu.zone[qnConfig.zone];
    this.formUploader = new qiniu.form_up.FormUploader(config);
    this.putExtra = new qiniu.form_up.PutExtra();
    this.bucketManager = new qiniu.rs.BucketManager(this.mac, config);
    let mimeType = {
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.ttf': 'font/ttf',
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.txt': 'text/plain',
      '.doc': 'application/msword',
      '.xls': 'application/vnd.ms-excel',
      '.xml': 'text/xml',
      '.apk': 'application/vnd.android.package-archive',
      '.svg': 'image/svg+xml',
      '.map': 'application/x-navimap',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.eot': 'font/eot',
      '.webp': 'image/webp'
    };
    try {
      let customMimeType = qnConfig.mimeType;// 合并自定义的文件类型
      if (customMimeType) {
        for (let k in customMimeType) {
          if (customMimeType.hasOwnProperty(k)) {
            mimeType[k] = customMimeType[k]
          }
        }
      }
    } catch (e) {
      console.log(e)
    }
    this.mimeType = mimeType;
    this.waitDeleteList = [];
    this.waitUploadList = [];
    this.waitChangeMimeTypeList = [];
  }

  apply(compiler) {
    compiler.hooks.compilation.tap('QiniuUploadPluginPro', compilation => {
      if (this.config.pathPrefix && this.config.pathPrefix !== '') {
        compilation.outputOptions.publicPath = this.config.publicPath + this.config.pathPrefix;
      } else {
        compilation.outputOptions.publicPath = this.config.publicPath;
      }
      this.absolutePath = compilation.outputOptions.path;
    });
    compiler.hooks.done.tapAsync('QiniuUploadPluginPro', (data, callback) => {
      // 先返回构建结果，然后异步上传
      callback();
      console.log('\n\n开始七牛云插件任务...\n\n');
      Object.keys(data.compilation.assets).forEach(file => {
        if (this.config.excludeRegex) {
          if (!this.config.excludeRegex.test(file)) {
            this.waitUploadList.push(file);
          }
        } else {
          this.waitUploadList.push(file);
        }
      });
      if (this.config.deleteBefore) {
        this.getPathPrefixFiles()
      } else {
        this.startUpload(data)
      }
    });
  }

  static chunk(arr, size) {
    let result = [];
    for (let i = 0; i < arr.length; i = i + size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }

  startUpload() {
    let uploadPromise = [];
    const spinner = ora('开始上传... \n').start();
    this.waitUploadList.forEach((key) => {
      uploadPromise.push(this.uploadFile(key))
    });
    Promise.all(uploadPromise)
      .then(() => {
        spinner.succeed('文件上传结束！');
        this.startChangeMimeType()
      })
      .catch(err => {
        console.log(err);
      });
  }

  startChangeMimeType() {
    let mimePromise = [];
    const spinner = ora('修改MimeType... \n').start();
    QiniuUploadPluginPro.chunk(this.waitChangeMimeTypeList, 100).forEach((ops) => {
      mimePromise.push(this.changeMimeTypeBatch(ops))
    });
    Promise.all(mimePromise).then(() => {
      spinner.succeed('修改文件MimeType结束！');
      console.log('\n\n七牛云插件任务已结束...')
    }).catch(err => {
      console.log(err);
    });
  }

  changeMimeTypeBatch(ops) {
    return new Promise((resolve, reject) => {
      this.bucketManager.batch(ops, (respErr, respBody, respInfo) => {
        if (respErr) {
          throw respErr;
        }
        if (respInfo.statusCode == 200) {
          resolve(respInfo);
        } else {
          reject(respInfo);
        }
      });
    });
  }

  getPathPrefixFiles() {
    const spinner = ora(`获取指定前缀文件列表：${this.config.pathPrefix} \n`).start();
    let options = {
      limit: this.config.pathPrefixLimit,// 设置一个尽可能大的数，一次加载完所有的前缀文件列表
      prefix: this.config.pathPrefix,
    };
    this.bucketManager.listPrefix(this.config.bucket, options, (respErr, respBody, respInfo) => {
      if (respErr) {
        console.log(respErr);
        throw respErr;
      }
      if (respInfo.statusCode == 200) {
        //如果这个nextMarker不为空，那么还有未列举完毕的文件列表，下次调用listPrefix的时候，
        //指定options里面的marker为这个值
        let nextMarker = respBody.marker;
        if (nextMarker) {
          throw Error('前缀文件列表未加载完全，尝试配置更大的pathPrefixLimit值，默认值为 99999999');
        }
        let items = respBody.items || [];
        if (!items || items.length === 0) {
          spinner.succeed(`获取到指定前缀文件列表为空：${this.config.pathPrefix}`);
          this.startUpload()
        } else {
          spinner.succeed(`共获取到指定前缀文件：${items.length}`);
          items.forEach((item) => {
            spinner.succeed(item.key);
            this.waitDeleteList.push(qiniu.rs.deleteOp(this.config.bucket, item.key));
          });
          this.startDelete()
        }
      } else {
        spinner.fail(`获取指定前缀文件列表：${this.config.pathPrefix} 失败！`);
        console.log(respInfo.statusCode);
        console.log(respBody);
      }
    });
  }

  startDelete() {
    let deletePromise = [];
    const spinner = ora(`开始删除指定前缀文件列表：${this.config.pathPrefix} \n`).start();
    QiniuUploadPluginPro.chunk(this.waitDeleteList, 100).forEach((ops) => {
      deletePromise.push(this.deleteBatch(ops));
    });
    Promise.all(deletePromise).then(() => {
      spinner.succeed(`指定前缀文件列表删除完成！`);
      this.startUpload()
    }).catch((e) => {
      console.log(e)
    })
  }

  deleteBatch(ops) {
    return new Promise((resolve, reject) => {
      this.bucketManager.batch(ops, (respErr, respBody, respInfo) => {
        if (respErr) {
          console.log(respErr);
          throw respErr;
        }
        if (respInfo.statusCode == 200) {
          resolve(respInfo);
        } else {
          reject(respInfo);
        }
      });
    });
  }

  uploadFile(filename, coverUploadToken) {
    let key;
    if (this.config.pathPrefix && this.config.pathPrefix !== '') {
      key = this.config.pathPrefix + filename;
    } else {
      key = filename;
    }
    const localFile = path.join(this.absolutePath || '', filename);
    return new Promise((resolve, reject) => {
      // 文件上传
      const spinner = ora(`上传文件：${filename} \n`).start();
      const uploadToken = coverUploadToken ? coverUploadToken : this.uploadToken;
      this.formUploader.putFile(uploadToken, key, localFile, this.putExtra, (respErr, respBody, respInfo) => {
          if (respErr) {
            throw respErr;
          }
          if (respInfo.statusCode == 200) {
            this.waitChangeMimeTypeList.push(
              qiniu.rs.changeMimeOp(this.config.bucket, respBody.key, this.getMimeTypeByKey(respBody.key))
            );
            spinner.succeed(`文件：${key} 上传成功！`);
            resolve(respInfo);
          } else {
            if (this.config.cover && (respInfo.status === 614 || respInfo.statusCode === 614)) {
              spinner.fail(`文件：${key} 已存在，尝试覆盖上传！`);
              resolve(this.uploadFile(filename, this.coverUploadFile(filename)));
            } else {
              spinner.fail(`文件：${key} 上传失败！`);
              reject(respInfo);
            }
          }
        }
      );
    });
  }

  getMimeTypeByKey(key) {
    let start = key.lastIndexOf('.');
    let ext;
    if (start === -1) {
      ext = '';
    } else {
      ext = key.substring(start);
    }
    return this.mimeType[ext] || 'application/octet-stream';
  }

  coverUploadFile(key) {
    let options = {
      scope: this.config.bucket + ':' + key
    };
    let putPolicy = new qiniu.rs.PutPolicy(options);
    return putPolicy.uploadToken(this.mac);
  }
}

module.exports = QiniuUploadPluginPro;
