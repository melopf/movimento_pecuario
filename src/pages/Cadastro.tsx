import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, CheckCircle } from 'lucide-react';
import { supabaseAdmin } from '../lib/supabase';
import { adminCreateAuthUser } from '../services/userService';

interface RegisterForm {
  name: string;
  email: string;
  fazendaNome: string;
  password: string;
}

const inputClass =
  'w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all';

export function Cadastro() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [success, setSuccess]           = useState(false);
  const [error, setError]               = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>();

  async function onSubmit(data: RegisterForm) {
    setError('');
    setLoading(true);
    try {
      // 1. Criar auth user via admin API (email_confirm: true — sem envio de e-mail)
      const userId = await adminCreateAuthUser(
        data.email.toLowerCase().trim(),
        data.password,
        data.name.trim(),
        'client',
      );

      // 2. Criar fazenda pré-cadastro (inactive — ativada pelo admin)
      const { data: farm, error: farmError } = await supabaseAdmin
        .from('farms')
        .insert({ nome_fazenda: data.fazendaNome.trim().toUpperCase(), active: false })
        .select()
        .single();
      if (farmError) throw new Error(farmError.message);

      // 3. Criar perfil (inactive — liberado pelo admin)
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id:      userId,
          name:    data.name.trim().toUpperCase(),
          email:   data.email.toLowerCase().trim(),
          role:    'client',
          modules: ['relatorio'],
          farm_id: farm.id,
          active:  false,
        });
      if (profileError) throw new Error(profileError.message);

      setSuccess(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.toLowerCase().includes('already been registered') || msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('email already'))
        setError('Este e-mail já está cadastrado. Tente fazer login ou recupere sua senha.');
      else if (msg.toLowerCase().includes('password'))
        setError('A senha deve ter no mínimo 6 caracteres.');
      else if (msg.toLowerCase().includes('invalid email'))
        setError('E-mail inválido. Verifique e tente novamente.');
      else
        setError(msg || 'Erro ao cadastrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  /* ── Tela de sucesso ── */
  if (success) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-teal-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-3">Cadastro Concluído!</h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Seu cadastro foi recebido com sucesso.<br />
            Aguarde a liberação pelo administrador.<br />
            <span className="text-teal-600 font-medium">Você receberá um e-mail quando for aprovado.</span>
          </p>
          <Link
            to="/login"
            className="block w-full py-3 rounded-xl text-white font-semibold text-sm bg-teal-600 hover:bg-teal-700 transition-all text-center"
          >
            Voltar ao Login
          </Link>
        </div>
      </div>
    );
  }

  /* ── Formulário ── */
  return (
    <div className="flex h-screen w-full">
      {/* Painel esquerdo */}
      <div
        className="hidden md:flex w-2/5 flex-col justify-between p-10 text-white relative overflow-hidden"
        style={{ backgroundImage: 'url(/images/capa.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(10,30,18,0.72) 0%, rgba(10,30,18,0.55) 45%, rgba(10,30,18,0.82) 100%)' }} />
        <div className="relative z-10">
          <div className="inline-block bg-white/10 backdrop-blur-sm rounded-2xl p-3 mb-6 border border-white/20">
            <img src="/images/logo.png" alt="Movimento Pecuário" className="w-32" style={{ filter: 'brightness(0) invert(1)' }} />
          </div>
        </div>
        <div className="relative z-10 flex-1 flex flex-col justify-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-300 mb-3">Movimento Pecuário</p>
          <h1 className="text-3xl font-extrabold leading-tight mb-4">Comece agora<br />sua gestão<br />pecuária</h1>
          <p className="text-white/70 text-sm leading-relaxed max-w-xs">
            Preencha os dados e aguarde a aprovação do administrador para acessar o sistema.
          </p>
        </div>
        <div className="relative z-10">
          <ul className="space-y-2.5">
            {['Relatórios detalhados por suplemento', 'Lançamento rápido de consumo', 'Gestão de pastos por fazenda'].map(label => (
              <li key={label} className="flex items-center gap-2.5 text-sm text-white/80">
                <span className="w-5 h-5 rounded-full bg-teal-500/30 border border-teal-400/50 flex items-center justify-center flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 block" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex-1 flex flex-col items-center justify-center bg-white px-8">
        <div className="w-full max-w-sm">
          <img src="/images/logo.png" alt="Movimento Pecuário" className="w-44 mx-auto mb-8" />
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Criar conta</h2>
          <p className="text-sm text-gray-500 mb-8">Preencha os dados para solicitar acesso</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Nome</label>
              <input
                type="text" placeholder="Seu nome completo"
                className={inputClass}
                style={{ textTransform: 'uppercase' }}
                {...register('name', { required: 'Informe o nome' })}
              />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">E-mail</label>
              <input
                type="email" placeholder="seu@email.com"
                className={inputClass}
                style={{ textTransform: 'none' }}
                {...register('email', { required: 'Informe o e-mail' })}
              />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Nome da Fazenda</label>
              <input
                type="text" placeholder="Ex: Fazenda Malhada Grande"
                className={inputClass}
                style={{ textTransform: 'uppercase' }}
                {...register('fazendaNome', { required: 'Informe o nome da fazenda' })}
              />
              {errors.fazendaNome && <p className="text-xs text-red-500 mt-1">{errors.fazendaNome.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className={`${inputClass} pr-11 no-uppercase`}
                  {...register('password', {
                    required: 'Informe a senha',
                    minLength: { value: 6, message: 'Mínimo 6 caracteres' },
                  })}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword(v => !v)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
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
              {loading ? 'Enviando...' : 'Solicitar Acesso'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Já tem conta?{' '}
            <Link to="/login" className="text-teal-600 font-semibold hover:underline">
              Entrar
            </Link>
          </p>

          <p className="text-center text-xs text-gray-400 mt-6">v1.26 © 2025 Suplemento Control</p>
        </div>
      </div>
    </div>
  );
}
