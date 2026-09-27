const datasets = [
  ['TikTok 视频与评论', '视频详情、作者信息和分页评论，适合内容分析与训练数据构建。'],
  ['社交平台公开内容', '按平台、时间和主题整理的可下载数据集。'],
  ['研究级原始样本', '保留来源和采集上下文，方便二次清洗与验证。'],
];
export default function Home() {
  return (
    <>
      <header className="nav">
        <div className="brand">datalom</div>
        <nav>
          <a href="#datasets">数据集</a>
          <a href="#formats">格式</a>
          <a className="button" href="/login">
            登录
          </a>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="eyebrow">DATASETS FOR BUILDERS</div>
          <h1>找到可以直接使用的数据。</h1>
          <p>
            浏览、购买并下载经过采集、清洗和版本管理的数据集。JSON、JSONL、CSV、Parquet，多种格式按需导出。
          </p>
          <a className="button" href="#datasets">
            浏览数据集 →
          </a>
        </section>
        <section className="section" id="datasets">
          <div className="eyebrow">CURATED COLLECTIONS</div>
          <h2>热门数据集</h2>
          <div className="grid">
            {datasets.map(([title, desc]) => (
              <article className="card" key={title}>
                <h3>{title}</h3>
                <p>{desc}</p>
                <a href="/datasets">查看详情 →</a>
              </article>
            ))}
          </div>
        </section>
        <section className="section" id="formats">
          <div className="card">
            <h2>按你的工作流下载</h2>
            <p>
              小样例可直接预览，完整数据支持 JSON、JSONL、CSV、Parquet
              和训练格式。购买后可在用户后台生成导出任务。
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
