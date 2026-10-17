import {
  Home,
  Building2,
  ArrowUpRight,
  ArrowRight,
  MessageSquare,
  Wallet,
  Sparkles,
  Download,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { Brand } from "../components/Common";
export function Landing({
  login,
  installHelp,
}: {
  login: (role: "resident" | "chair") => void;
  installHelp: () => void;
}) {
  return (
    <>
      <header className="landing-nav">
        <Brand />
        <button
          onClick={() =>
            document
              .getElementById("roles")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          Посмотреть демо <ArrowUpRight size={16} />
        </button>
      </header>
      <main className="landing">
        <div className="eyebrow">
          <span /> ЗАБОТА О ДОМЕ НАЧИНАЕТСЯ ЗДЕСЬ
        </div>
        <h1>
          Один дом.
          <br />
          Общие заботы.
          <br />
          <em>Простые решения.</em>
        </h1>
        <p className="lead">
          Документы, обращения и помощь
          <br />
          по вопросам вашего дома
        </p>
        <div id="roles" className="role-cards">
          <button onClick={() => login("resident")}>
            <Home />
            <strong>Войти как житель</strong>
            <span>
              Быть в курсе жизни дома <ArrowRight size={18} />
            </span>
          </button>
          <button onClick={() => login("chair")}>
            <Building2 />
            <strong>Войти как председатель</strong>
            <span>
              Управлять делами в одном месте <ArrowRight size={18} />
            </span>
          </button>
        </div>
        <p className="muted">
          Без регистрации. Выберите роль и познакомьтесь с сервисом.
        </p>
        <section className="landing-house">
          <div className="house-art">
            <div className="roof" />
            {Array.from({ length: 18 }, (_, i) => (
              <i key={i} />
            ))}
            <div className="door" />
          </div>
          <div className="house-label">
            <span className="green-dot" /> Дом, в котором всё понятно
            <small>ОСИ «Ертіс үйі» · демонстрационный дом</small>
          </div>
          <span className="floating f1">
            <CheckCircle2 size={18} /> Обращение принято
          </span>
          <span className="floating f2">
            <FileText size={18} /> Все документы под рукой
          </span>
        </section>
        <div className="benefits">
          <div>
            <MessageSquare />
            <h3>Вас слышат</h3>
            <p>Сообщайте о проблемах и следите за решением.</p>
          </div>
          <div>
            <Wallet />
            <h3>Всё прозрачно</h3>
            <p>Смотрите, какие работы выполнены и на что потрачены деньги.</p>
          </div>
          <div>
            <Sparkles />
            <h3>Помощь рядом</h3>
            <p>Задавайте вопросы о доме простыми словами.</p>
          </div>
        </div>
        <button className="text-btn" onClick={() => installHelp()}>
          <Download size={16} /> Как установить на телефон
        </button>
      </main>
    </>
  );
}
