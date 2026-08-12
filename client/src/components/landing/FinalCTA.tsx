import ROUTES from "@/routes";
import { ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import useScrollReveal from "../../hooks/useScrollReveal";

const FinalCTA = () => {
    const { ref, isVisible } = useScrollReveal();
    const navigate = useNavigate()

    return (
        <section className="relative py-24 overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 bg-gradient-to-b from-muted/20 to-background" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-primary/20 to-secondary/20 rounded-full blur-[150px]" />

            <div className="relative z-10 max-w-4xl mx-auto px-6">
                <div
                    ref={ref as React.RefObject<HTMLDivElement>}
                    className={`glass-card p-12 md:p-16 text-center relative overflow-hidden scroll-reveal-scale ${isVisible ? 'visible' : ''}`}
                >
                    {/* Decorative elements */}
                    <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-br-full" />
                    <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-secondary/20 to-transparent rounded-tl-full" />

                    {/* Floating sparkles */}
                    <div className="absolute top-8 right-8 text-primary/40 animate-pulse">
                        <Sparkles className="w-8 h-8" />
                    </div>
                    <div className="absolute bottom-8 left-8 text-secondary/40 animate-pulse" style={{ animationDelay: '1s' }}>
                        <Sparkles className="w-6 h-6" />
                    </div>

                    <div className="relative z-10 space-y-6">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-sm text-muted-foreground">Join 10,000+ users today</span>
                        </div>

                        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold leading-tight">
                            Start Remembering the{" "}
                            <span className="gradient-text">Moments That Matter</span>
                        </h2>

                        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                            Let AI handle the remembering while you focus on creating memories.
                            Set up in 2 minutes, free forever.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                            <Button variant="hero" size="xl" className="w-full sm:w-auto"

                                onClick={() => window.open(
                                    ROUTES.WHATSAPP_CONNECT_LINK,
                                    "_blank"
                                )}>
                                Get Started Free
                                <ArrowRight className="w-5 h-5" />
                            </Button>
                            <p className="text-sm text-muted-foreground">
                                No credit card required
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default FinalCTA;
