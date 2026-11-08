import ProfileForm from './profile-form';

export default function PerfilPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Meu Perfil</h1>
          <p className="text-gray-600 mb-6 text-sm">
            Atualize suas informações pessoais abaixo.
          </p>
          
          <ProfileForm />
        </div>
      </div>
    </main>
  );
}