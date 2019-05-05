# qiniu-upload-plugin-pro

**将 webpack 打包出来的文件上传到七牛云。**

> 该项目基于[yhlben/qiniu-upload-plugin](https://github.com/yhlben/qiniu-upload-plugin)以及[七牛Node.js SDK](https://developer.qiniu.com/kodo/sdk/1289/nodejs)实现

## 特点

- 支持上传webpack打包的文件
- 支持配置忽略文件正则
- 支持覆盖已上传文件
- 支持指定文件路径前缀
- 支持上传前删除指定前缀文件列表
- 支持指定上传文件的文件类型

## 安装

```js
npm install qiniu-upload-plugin-pro --save-dev
```

## 使用方法

```js
const QiniuUploadPluginPro = require('./QiniuUploadPluginPro');

plugins: [
  new QiniuUploadPluginPro({
    excludeRegex: /.html$/,// 需要排除文件的正则
    publishPath: 'http://cdn.xxx.com', // 七牛云域名，自动替换 publicPath
    accessKey: 'your qiniu accessKey', // 个人中心，秘钥管理，AK
    secretKey: 'your qiniu secretKey', // 个人中心，秘钥管理，SK
    bucket: 'your qiniu bucket', // 存储空间名称
    zone: 'Zone_z2', // 存储地区
    // 可选参数：
    cover: false, // 默认为 false，设置为 true 会覆盖掉已经保存在七牛云上的同名文件
    deleteBefore: true,// 是否在上传前删除指定前缀文件列表
    pathPrefix: 'test/upload',// 文件前缀，上传文件路径 test/upload/你的文件路径,
    mimeType: {
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
    }// 上面为内置的文件类型映射，如果你的文件类型不在此列，请自己添加，将会和默认的合并，如果在可以忽略此配置项
  })
];
```
## 示例
 Vue cli 3配置  

 ![示例](https://ws1.sinaimg.cn/large/a7bfec21gy1g2q7uo84l8j20hc0e9glz.jpg)
