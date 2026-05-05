import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface FormData {
  email: string;
  password: string;
}

export function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>();

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(data: FormData) {
    setError('');
    setLoading(true);
    await new Promise(r => setTimeout(r, 150));
    const ok = await login(data.email, data.password);
    setLoading(false);
    if (ok) {
      navigate('/');
    } else {
      setError('E-mail ou senha incorretos.');
    }
  }

  const inputClass =
    'w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all';

  return (
    <div className="flex h-screen w-full">
      {/* Left panel — hero image */}
      <div
        className="hidden md:flex w-2/5 flex-col justify-between p-10 text-white relative overflow-hidden"
        style={{
          backgroundImage: 'url(/images/capa.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Overlay */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(10,30,18,0.72) 0%, rgba(10,30,18,0.55) 45%, rgba(10,30,18,0.82) 100%)' }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <div className="inline-block bg-white/10 backdrop-blur-sm rounded-2xl p-3 mb-6 border border-white/20">
            <img
              src="/images/logo.png"
              alt="Movimento Pecuário"
              className="w-32"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </div>
        </div>

        {/* Center headline */}
        <div className="relative z-10 flex-1 flex flex-col justify-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-300 mb-3">
            Movimento Pecuário
          </p>
          <h1 className="text-3xl font-extrabold leading-tight mb-4">
            Gestão inteligente<br />de suplementação<br />pecuária
          </h1>
          <p className="text-white/70 text-sm leading-relaxed max-w-xs">
            Controle seu rebanho, acompanhe o consumo e tome decisões com dados precisos.
          </p>
        </div>

        {/* Bottom features */}
        <div className="relative z-10">
          <ul className="space-y-2.5">
            {[
              { label: 'Relatórios detalhados por suplemento' },
              { label: 'Lançamento rápido de consumo' },
              { label: 'Gestão de pastos por fazenda' },
            ].map(item => (
              <li key={item.label} className="flex items-center gap-2.5 text-sm text-white/80">
                <span className="w-5 h-5 rounded-full bg-teal-500/30 border border-teal-400/50 flex items-center justify-center flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 block" />
                </span>
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center bg-white px-8">
        <div className="w-full max-w-sm">
          <img
            src="/images/logo.png"
            alt="Movimento Pecuário"
            className="w-44 mx-auto mb-8"
          />

          <h2 className="text-2xl font-bold text-gray-800 mb-1">Bem-vindo de volta</h2>
          <p className="text-sm text-gray-500 mb-8">Entre com sua conta</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">E-mail</label>
              <input
                type="email"
                placeholder="seu@email.com"
                className={inputClass}
                {...register('email', { required: 'Informe o e-mail' })}
              />
              {errors.email && (
                <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className={`${inputClass} pr-11 no-uppercase`}
                  {...register('password', { required: 'Informe a senha' })}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword(v => !v)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all bg-teal-600 hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400">ou</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          <a
            href="/cadastro"
            className="block w-full py-3 rounded-xl text-teal-700 font-semibold text-sm text-center border-2 border-teal-600 hover:bg-teal-50 transition-all"
          >
            Criar Conta
          </a>

          <p className="text-center mt-4">
            <a href="/recuperar-senha" className="text-xs text-gray-400 hover:text-teal-600 transition-colors">
              Esqueci minha senha
            </a>
          </p>

          <p className="text-center text-xs text-gray-400 mt-6">v1.27b © 2025 Suplemento Control</p>
        </div>
      </div>
    </div>
  );
}
