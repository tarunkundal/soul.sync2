import ROUTES from "@/routes";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/button";

const Navbar = () => {
    const navigate = useNavigate();
    return (
        <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 border-b border-border/50 bg-black">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <img
                        src="/heart.png"
                        alt="SoulSync AI logo"
                        className="w-10 h-10 object-contain"
                    />
                    <span className="text-xl font-display font-bold text-foreground">SoulSync AI</span>
                </div>

                <div className="hidden md:flex items-center gap-8">
                    <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
                    <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">How it Works</a>
                    <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
                </div>

                <div className="flex items-center gap-3">

                    <Button variant="hero" size="sm" onClick={() => window.open(
                        ROUTES.WHATSAPP_CONNECT_LINK,
                        "_blank"
                    )}>
                        Get Started
                    </Button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
